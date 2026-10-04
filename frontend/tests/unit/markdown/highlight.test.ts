import { render } from '@testing-library/react';
import { createElement } from 'react';
import Markdown from 'react-markdown';

import { createPipeline } from '../../../src/logic/markdown/pipeline';

function code(language: string | undefined, body = 'package main'): HTMLElement {
    const source = `\`\`\`${language ?? ''}\n${body}\n\`\`\``;
    const pipeline = createPipeline('minimal');
    const rendered = render(createElement(Markdown, { ...pipeline, children: source }));
    const element = rendered.container.querySelector('pre code');
    if (!element) throw new Error('Expected a code fence');
    return element as HTMLElement;
}

it('colours a Go fence with syntax spans', () => {
    const element = code('go');
    expect(element.classList.contains('hljs')).toBe(true);
    expect(element.querySelector('[class^="hljs-"]')).not.toBeNull();
});

const languages: Array<[string, string]> = [
    ['javascript', 'const answer = 42;'],
    ['typescript', 'const answer: number = 42;'],
    ['go', 'package main'],
    ['python', 'def f(): return 1'],
    ['java', 'class Main {}'],
    ['c', 'int main(void) { return 0; }'],
    ['cpp', 'int main() { return 0; }'],
    ['csharp', 'class Main {}'],
    ['rust', 'fn main() {}'],
    ['ruby', 'def hello; end'],
    ['php', '<?php echo "hi";'],
    ['kotlin', 'fun main() {}'],
    ['swift', 'func main() {}'],
    ['sql', 'SELECT 1;'],
    ['json', '{"answer":42}'],
    ['yaml', 'answer: true'],
    ['ini', '[section]\nanswer=true'],
    ['xml', '<root>hello</root>'],
    ['css', 'body { color: red; }'],
    ['scss', '$color: red;'],
    ['bash', 'echo hello'],
    ['powershell', 'Write-Host "hello"'],
    ['dockerfile', 'FROM alpine'],
    ['makefile', 'all:\n\techo hello'],
    ['diff', '+hello'],
    ['markdown', '# Heading'],
];

it.each(languages)('colours a %s fence', (language, body) => {
    expect(code(language, body).querySelector('[class^="hljs-"]')).not.toBeNull();
});

const aliases: Array<[string, string]> = [
    ['jsx', 'const x = <div />;'],
    ['tsx', 'const x: number = 1;'],
    ['sh', 'echo hello'],
    ['shell', 'echo hello'],
    ['zsh', 'echo hello'],
    ['console', 'echo hello'],
    ['toml', '[section]\nanswer=true'],
    ['html', '<div>hello</div>'],
    ['md', '# Heading'],
    ['cs', 'class Main {}'],
    ['rs', 'fn main() {}'],
    ['kt', 'fun main() {}'],
    ['docker', 'FROM alpine'],
    ['patch', '+hello'],
    ['make', 'all:\n\techo hello'],
    ['mk', 'all:\n\techo hello'],
    ['jsonc', '{"answer":42}'],
    ['sass', '$color: red;'],
];

it.each(aliases)('colours a %s alias fence', (language, body) => {
    expect(code(language, body).querySelector('[class^="hljs-"]')).not.toBeNull();
});

it.each([
    ['unknown', 'plain code'],
    [undefined, 'plain code'],
    ['mermaid', 'graph TD; A-->B'],
])('keeps a %s fence plain', (language, body) => {
    const element = code(language, body);
    expect(element.querySelector('[class^="hljs-"]')).toBeNull();
    expect(element.classList.contains('hljs')).toBe(false);
    expect(element.textContent).toContain(body);
});

it('highlights exactly 200000 source characters but leaves 200001 plain', () => {
    const text = 'package main' + ' '.repeat(200000 - 'package main'.length);
    expect(code('go', text).querySelector('[class^="hljs-"]')).not.toBeNull();
    const overLimit = code('go', `${text} `);
    expect(overLimit.querySelector('[class^="hljs-"]')).toBeNull();
    expect(overLimit.classList.contains('hljs')).toBe(false);
    expect(overLimit.textContent).toContain(text);
});
