// Command archlint owns the Go architecture rules that require more context
// than a package-local linter can provide.
package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const mainGoFile = "main.go"

type goSource struct {
	path string
	fset *token.FileSet
	file *ast.File
}

type finding struct {
	rule string
	path string
	line int
	text string
}

type exportedSymbol struct {
	name        string
	qualified   string
	packageName string
	path        string
	line        int
	declaration token.Pos
	method      bool
}

func main() {
	root := repositoryRoot()
	sources, err := loadProductionGoSources(root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "archlint: %v\n", err)
		os.Exit(1)
	}

	findings := make([]finding, 0)
	findings = append(findings, checkBoundHandlers(root, sources)...)
	findings = append(findings, checkCallerlessExports(root, sources)...)

	sort.Slice(findings, func(i, j int) bool {
		if findings[i].path != findings[j].path {
			return findings[i].path < findings[j].path
		}
		if findings[i].line != findings[j].line {
			return findings[i].line < findings[j].line
		}
		return findings[i].rule < findings[j].rule
	})

	for _, item := range findings {
		location := item.path
		if item.line > 0 {
			location = fmt.Sprintf("%s:%d", location, item.line)
		}
		fmt.Printf("archlint %s %s: %s\n", item.rule, location, item.text)
	}
	if len(findings) > 0 {
		fmt.Printf("archlint: %d finding(s)\n", len(findings))
		os.Exit(1)
	}
	fmt.Println("archlint: ok")
}

func repositoryRoot() string {
	command := exec.Command("git", "rev-parse", "--show-toplevel")
	output, err := command.Output()
	if err == nil {
		return strings.TrimSpace(string(output))
	}
	root, err := os.Getwd()
	if err != nil {
		return "."
	}
	return root
}

func loadProductionGoSources(root string) ([]goSource, error) {
	paths := make([]string, 0)
	for _, base := range []string{filepath.Join(root, "internal"), filepath.Join(root, "tools")} {
		err := filepath.WalkDir(base, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				if entry.Name() == "vendor" {
					return filepath.SkipDir
				}
				return nil
			}
			if filepath.Ext(path) == ".go" && !strings.HasSuffix(path, "_test.go") {
				paths = append(paths, path)
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	mainPath := filepath.Join(root, mainGoFile)
	if _, err := os.Stat(mainPath); err == nil {
		paths = append(paths, mainPath)
	}
	sort.Strings(paths)

	sources := make([]goSource, 0, len(paths))
	for _, path := range paths {
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", path, err)
		}
		sources = append(sources, goSource{path: path, fset: fset, file: file})
	}
	return sources, nil
}

func checkBoundHandlers(root string, sources []goSource) []finding {
	mainPath := filepath.Join(root, mainGoFile)
	mainSource := sourceByPath(sources, mainPath)
	if mainSource == nil {
		return []finding{{rule: "L4", path: mainGoFile, text: "Bind list could not be read"}}
	}

	boundFields := boundFieldsIn(mainSource.file)

	if len(boundFields) == 0 {
		return []finding{{rule: "L4", path: mainGoFile, text: "Bind list is empty or could not be read"}}
	}

	boundTypes := boundTypesForFields(sources, boundFields, false)

	findings := make([]finding, 0)
	for _, source := range sources {
		for _, declaration := range topLevelFunctions(source.file) {
			receiver := receiverTypeName(declaration.Recv)
			if declaration.Recv == nil || !ast.IsExported(declaration.Name.Name) || !boundTypes[receiver] {
				continue
			}
			method := fmt.Sprintf("%s.%s", receiver, declaration.Name.Name)
			findings = append(findings, validateBoundMethod(source, declaration, method)...)
		}
	}
	return findings
}

func validateBoundMethod(source goSource, declaration *ast.FuncDecl, method string) []finding {
	findings := make([]finding, 0)
	position := source.fset.Position(declaration.Pos())
	add := func(text string) {
		findings = append(findings, finding{rule: "L4", path: position.Filename, line: position.Line, text: method + ": " + text})
	}

	if declaration.Type.Results == nil || len(declaration.Type.Results.List) != 1 {
		add("must return exactly one apperr.*Result")
	} else {
		result := declaration.Type.Results.List[0]
		if len(result.Names) != 1 {
			add("must use one named result")
		}
		if !isApperrResult(result.Type) {
			add("must return an apperr.*Result")
		}
	}

	if hasContextParameter(declaration.Type.Params) {
		add("must not take context.Context")
	}
	if declaration.Body == nil || len(declaration.Body.List) == 0 {
		add("first statement must defer bridge.Guard on the named result")
		return findings
	}
	deferStatement, ok := declaration.Body.List[0].(*ast.DeferStmt)
	if !ok || !isGuardCall(deferStatement.Call) {
		add("first statement must be defer bridge.Guard(&result)")
		return findings
	}
	if declaration.Type.Results == nil || len(declaration.Type.Results.List) != 1 || len(declaration.Type.Results.List[0].Names) != 1 {
		return findings
	}
	name := declaration.Type.Results.List[0].Names[0].Name
	if !isAddressOfIdentifier(deferStatement.Call.Args, name) {
		add("bridge.Guard must receive the named result")
	}
	return findings
}

func topLevelFunctions(file *ast.File) []*ast.FuncDecl {
	functions := make([]*ast.FuncDecl, 0)
	for _, declaration := range file.Decls {
		if function, ok := declaration.(*ast.FuncDecl); ok {
			functions = append(functions, function)
		}
	}
	return functions
}

func sourceByPath(sources []goSource, path string) *goSource {
	for index := range sources {
		if sources[index].path == path {
			return &sources[index]
		}
	}
	return nil
}

func identifierName(expression ast.Expr) string {
	identifier, ok := expression.(*ast.Ident)
	if !ok {
		return ""
	}
	return identifier.Name
}

func namedType(expression ast.Expr) string {
	switch value := expression.(type) {
	case *ast.StarExpr:
		return namedType(value.X)
	case *ast.Ident:
		return value.Name
	case *ast.SelectorExpr:
		return value.Sel.Name
	default:
		return ""
	}
}

func receiverTypeName(fields *ast.FieldList) string {
	if fields == nil || len(fields.List) != 1 {
		return ""
	}
	return namedType(fields.List[0].Type)
}

func isApperrResult(expression ast.Expr) bool {
	selector, ok := expression.(*ast.SelectorExpr)
	if !ok || selector.Sel == nil || !strings.HasSuffix(selector.Sel.Name, "Result") {
		return false
	}
	packageName, ok := selector.X.(*ast.Ident)
	return ok && packageName.Name == "apperr"
}

func hasContextParameter(fields *ast.FieldList) bool {
	if fields == nil {
		return false
	}
	found := false
	for _, field := range fields.List {
		ast.Inspect(field.Type, func(node ast.Node) bool {
			selector, ok := node.(*ast.SelectorExpr)
			if ok && selector.Sel.Name == "Context" && identifierName(selector.X) == "context" {
				found = true
			}
			return !found
		})
	}
	return found
}

func isGuardCall(call *ast.CallExpr) bool {
	if call == nil || len(call.Args) != 1 {
		return false
	}
	selector, ok := call.Fun.(*ast.SelectorExpr)
	return ok && selector.Sel.Name == "Guard" && identifierName(selector.X) == "bridge"
}

func isAddressOfIdentifier(arguments []ast.Expr, name string) bool {
	if len(arguments) != 1 {
		return false
	}
	address, ok := arguments[0].(*ast.UnaryExpr)
	return ok && address.Op == token.AND && identifierName(address.X) == name
}

func checkCallerlessExports(root string, sources []goSource) []finding {
	boundTypes := boundHandlerTypes(root, sources)
	symbols := make([]exportedSymbol, 0)
	identifierUses := make(map[string]int)
	selectorUses := make(map[string]int)
	qualifiedUses := make(map[string]int)
	interfaceUses := interfaceMethodUses(sources)
	interfaceSignatures := interfaceMethodSignatures(sources)
	findings := make([]finding, 0)

	for _, source := range sources {
		symbols = append(symbols, exportedSymbols(source, boundTypes)...)
		countSourceUses(source, identifierUses, selectorUses, qualifiedUses)
	}

	for _, symbol := range symbols {
		if symbol.method {
			methodKey := symbol.packageName + "." + symbol.qualified
			if selectorUses[symbol.name] > 0 || interfaceUses[methodKey] || interfaceSignatures[symbol.packageName][methodSignature(sourceForSymbol(sources, symbol), symbol)] || standardProtocolMethod(symbol.name) {
				continue
			}
		} else {
			identifierUses[symbol.name]--
			if identifierUses[symbol.name] > 0 || qualifiedUses[symbol.packageName+"."+symbol.name] > 0 {
				continue
			}
		}
		findings = append(findings, finding{rule: "L6", path: symbol.path, line: symbol.line, text: symbol.qualified + " has no production caller"})
	}
	return findings
}

func exportedSymbols(source goSource, boundTypes map[string]bool) []exportedSymbol {
	var symbols []exportedSymbol
	for _, declaration := range source.file.Decls {
		switch declaration := declaration.(type) {
		case *ast.FuncDecl:
			if symbol, ok := exportedFunction(source, declaration, boundTypes); ok {
				symbols = append(symbols, symbol)
			}
		case *ast.GenDecl:
			symbols = append(symbols, exportedDeclarations(source, declaration)...)
		}
	}
	return symbols
}

func exportedFunction(source goSource, declaration *ast.FuncDecl, boundTypes map[string]bool) (exportedSymbol, bool) {
	name := declaration.Name.Name
	if !ast.IsExported(name) {
		return exportedSymbol{}, false
	}
	method := declaration.Recv != nil
	qualified := name
	if method {
		receiver := receiverTypeName(declaration.Recv)
		if boundTypes[receiver] || callerlessExportException(name) {
			return exportedSymbol{}, false
		}
		qualified = receiver + "." + name
	}
	position := source.fset.Position(declaration.Pos())
	return exportedSymbol{name: name, qualified: qualified, packageName: source.file.Name.Name, path: position.Filename, line: position.Line, declaration: declaration.Name.Pos(), method: method}, true
}

func exportedDeclarations(source goSource, declaration *ast.GenDecl) []exportedSymbol {
	if declaration.Tok != token.TYPE && declaration.Tok != token.VAR && declaration.Tok != token.CONST {
		return nil
	}
	var symbols []exportedSymbol
	for _, specification := range declaration.Specs {
		var names []*ast.Ident
		switch specification := specification.(type) {
		case *ast.TypeSpec:
			names = []*ast.Ident{specification.Name}
		case *ast.ValueSpec:
			names = specification.Names
		}
		for _, name := range names {
			if !ast.IsExported(name.Name) {
				continue
			}
			position := source.fset.Position(name.Pos())
			symbols = append(symbols, exportedSymbol{name: name.Name, qualified: name.Name, packageName: source.file.Name.Name, path: position.Filename, line: position.Line, declaration: name.Pos()})
		}
	}
	return symbols
}

func countSourceUses(source goSource, identifiers, selectors, qualified map[string]int) {
	ast.Inspect(source.file, func(node ast.Node) bool {
		if identifier, ok := node.(*ast.Ident); ok {
			identifiers[identifier.Name]++
		}
		if selector, ok := node.(*ast.SelectorExpr); ok {
			selectors[selector.Sel.Name]++
			if packageName, ok := importedPackageName(source.file, selector.X); ok {
				qualified[packageName+"."+selector.Sel.Name]++
			}
		}
		return true
	})
}

func sourceForSymbol(sources []goSource, symbol exportedSymbol) goSource {
	for _, source := range sources {
		if source.path == symbol.path {
			return source
		}
	}
	return goSource{}
}

func methodSignature(source goSource, symbol exportedSymbol) string {
	if source.file == nil {
		return ""
	}
	for _, declaration := range topLevelFunctions(source.file) {
		if declaration.Name.Pos() == symbol.declaration {
			return functionSignature(source.fset, declaration.Type)
		}
	}
	return ""
}

func functionSignature(fset *token.FileSet, function *ast.FuncType) string {
	if function == nil {
		return ""
	}
	return fieldListSignature(fset, function.Params) + "->" + fieldListSignature(fset, function.Results)
}

func fieldListSignature(fset *token.FileSet, fields *ast.FieldList) string {
	if fields == nil {
		return ""
	}
	parts := make([]string, 0, len(fields.List))
	for _, field := range fields.List {
		var typeText bytes.Buffer
		if err := format.Node(&typeText, fset, field.Type); err != nil {
			return ""
		}
		count := len(field.Names)
		if count == 0 {
			count = 1
		}
		parts = append(parts, fmt.Sprintf("%d:%s", count, typeText.String()))
	}
	return strings.Join(parts, ";")
}

func interfaceMethodSignatures(sources []goSource) map[string]map[string]bool {
	signatures := make(map[string]map[string]bool)
	for _, source := range sources {
		forEachInterface(source, func(interfaceType *ast.InterfaceType, _ string) {
			packageSignatures := signatures[source.file.Name.Name]
			if packageSignatures == nil {
				packageSignatures = make(map[string]bool)
				signatures[source.file.Name.Name] = packageSignatures
			}
			collectInterfaceSignatures(source.fset, interfaceType, packageSignatures)
		})
	}
	return signatures
}

func collectInterfaceSignatures(fset *token.FileSet, interfaceType *ast.InterfaceType, signatures map[string]bool) {
	for _, field := range interfaceType.Methods.List {
		if len(field.Names) == 0 || !ast.IsExported(field.Names[0].Name) {
			continue
		}
		if function, ok := field.Type.(*ast.FuncType); ok {
			signatures[functionSignature(fset, function)] = true
		}
	}
}

func forEachInterface(source goSource, visit func(*ast.InterfaceType, string)) {
	for _, declaration := range source.file.Decls {
		genDecl, ok := declaration.(*ast.GenDecl)
		if !ok || genDecl.Tok != token.TYPE {
			continue
		}
		for _, specification := range genDecl.Specs {
			typeSpec, ok := specification.(*ast.TypeSpec)
			if !ok {
				continue
			}
			if interfaceType, ok := typeSpec.Type.(*ast.InterfaceType); ok {
				visit(interfaceType, typeSpec.Name.Name)
			}
		}
	}
}

func importedPackageName(file *ast.File, expression ast.Expr) (string, bool) {
	identifier, ok := expression.(*ast.Ident)
	if !ok || identifier.Name == "" {
		return "", false
	}
	for _, declaration := range file.Imports {
		importPath, err := strconv.Unquote(declaration.Path.Value)
		if err != nil {
			continue
		}
		name := filepath.Base(importPath)
		if declaration.Name != nil {
			if declaration.Name.Name == "_" || declaration.Name.Name == "." {
				continue
			}
			name = declaration.Name.Name
		}
		if identifier.Name == name {
			if declaration.Name != nil {
				return filepath.Base(importPath), true
			}
			return name, true
		}
	}
	return "", false
}

// interfaceMethodUses records production interface assertions as callers of
// the methods they require. A method's implementation may be referenced only
// through an interface, so a selector-only scan would report valid adapters as
// dead code.
func interfaceMethodUses(sources []goSource) map[string]bool {
	interfaces := make(map[string][]string)
	for _, source := range sources {
		forEachInterface(source, func(interfaceType *ast.InterfaceType, name string) {
			interfaces[source.file.Name.Name+"."+name] = interfaceMethodNames(interfaceType)
		})
	}
	uses := make(map[string]bool)
	for _, source := range sources {
		for _, declaration := range source.file.Decls {
			genDecl, ok := declaration.(*ast.GenDecl)
			if !ok || genDecl.Tok != token.VAR {
				continue
			}
			for _, specification := range genDecl.Specs {
				recordInterfaceAssertion(source, specification, interfaces, uses)
			}
		}
	}
	return uses
}

func recordInterfaceAssertion(source goSource, specification ast.Spec, interfaces map[string][]string, uses map[string]bool) {
	valueSpec, ok := specification.(*ast.ValueSpec)
	if !ok || len(valueSpec.Names) != 1 || valueSpec.Names[0].Name != "_" || len(valueSpec.Values) != 1 {
		return
	}
	receiver := expressionTypeName(valueSpec.Values[0])
	if receiver == "" {
		return
	}
	methods := interfaceMethodNamesFromExpression(valueSpec.Type, source.file.Name.Name, interfaces)
	for _, method := range methods {
		uses[source.file.Name.Name+"."+receiver+"."+method] = true
	}
}

func interfaceMethodNamesFromExpression(expression ast.Expr, packageName string, interfaces map[string][]string) []string {
	if interfaceType, ok := expression.(*ast.InterfaceType); ok {
		return interfaceMethodNames(interfaceType)
	}
	identifier, ok := expression.(*ast.Ident)
	if !ok {
		return nil
	}
	return interfaces[packageName+"."+identifier.Name]
}

func interfaceMethodNames(interfaceType *ast.InterfaceType) []string {
	if interfaceType == nil || interfaceType.Methods == nil {
		return nil
	}
	methods := make([]string, 0)
	for _, field := range interfaceType.Methods.List {
		for _, name := range field.Names {
			if ast.IsExported(name.Name) {
				methods = append(methods, name.Name)
			}
		}
	}
	return methods
}

func expressionTypeName(expression ast.Expr) string {
	switch value := expression.(type) {
	case *ast.CallExpr:
		return expressionTypeName(value.Fun)
	case *ast.ParenExpr:
		return expressionTypeName(value.X)
	case *ast.StarExpr:
		return expressionTypeName(value.X)
	case *ast.Ident:
		return value.Name
	default:
		return ""
	}
}

func standardProtocolMethod(name string) bool {
	// encoding/json discovers these methods through its standard interfaces;
	// there is no source-level selector to count as a caller.
	return name == "MarshalJSON" || name == "UnmarshalJSON"
}

func boundHandlerTypes(root string, sources []goSource) map[string]bool {
	mainSource := sourceByPath(sources, filepath.Join(root, mainGoFile))
	if mainSource == nil {
		return nil
	}
	fields := boundFieldsIn(mainSource.file)

	return boundTypesForFields(sources, fields, true)
}

func boundFieldsIn(file *ast.File) map[string]bool {
	fields := make(map[string]bool)
	ast.Inspect(file, func(node ast.Node) bool {
		keyValue, ok := node.(*ast.KeyValueExpr)
		if !ok || identifierName(keyValue.Key) != "Bind" {
			return true
		}
		literal, ok := keyValue.Value.(*ast.CompositeLit)
		if !ok {
			return true
		}
		for _, element := range literal.Elts {
			if selector, ok := element.(*ast.SelectorExpr); ok {
				fields[selector.Sel.Name] = true
			}
		}
		return true
	})
	return fields
}

func boundTypesForFields(sources []goSource, fields map[string]bool, includeEmpty bool) map[string]bool {
	types := make(map[string]bool)
	for _, source := range sources {
		ast.Inspect(source.file, func(node ast.Node) bool {
			specification, ok := node.(*ast.TypeSpec)
			if !ok || specification.Name.Name != "ApplicationContextHolder" {
				return true
			}
			structure, ok := specification.Type.(*ast.StructType)
			if ok {
				collectBoundTypes(structure, fields, types, includeEmpty)
			}
			return true
		})
	}
	return types
}

func collectBoundTypes(structure *ast.StructType, fields, types map[string]bool, includeEmpty bool) {
	for _, field := range structure.Fields.List {
		for _, name := range field.Names {
			if !fields[name.Name] {
				continue
			}
			typeName := namedType(field.Type)
			if includeEmpty || typeName != "" {
				types[typeName] = true
			}
		}
	}
}

func callerlessExportException(name string) bool {
	return name == "ContentAccessor" || name == "DocumentCommands"
}
