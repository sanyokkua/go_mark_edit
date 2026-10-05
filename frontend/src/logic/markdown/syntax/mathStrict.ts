import { markdownLineEnding, markdownLineEndingOrSpace, unicodeWhitespace } from 'micromark-util-character';
import type {} from 'micromark-extension-math';
import type { Code, Construct, State } from 'micromark-util-types';
import remarkMath from 'remark-math';
import type { Processor } from 'unified';

const maxLookahead = 10_000;
const dollar = 36;
const backslash = 92;
const decimalDigit = /^\p{Nd}/u;

function whitespace(code: Code): boolean {
    return markdownLineEndingOrSpace(code) || unicodeWhitespace(code);
}

function digitAt(source: string, index: number): boolean {
    const codePoint = source.codePointAt(index);
    return codePoint !== undefined && decimalDigit.test(String.fromCodePoint(codePoint));
}

function eligibleClosers(source: string): Uint32Array {
    const next = new Uint32Array(source.length + 1);
    let nearest = 0;

    for (let index = source.length - 1; index >= 0; index--) {
        if (source.charCodeAt(index) === dollar) {
            let slashes = 0;
            while (source.charCodeAt(index - slashes - 1) === backslash) slashes++;
            const before = index > 0 ? source.charCodeAt(index - 1) : null;
            if (slashes % 2 === 0 && !unicodeWhitespace(before) && !digitAt(source, index + 1)) nearest = index;
        }
        next[index] = nearest;
    }

    return next;
}

function strictDollarSyntax(index: { current: Uint32Array | undefined }): Construct {
    return {
        name: 'mathText',
        tokenize(effects, ok, nok) {
            const sourceOffset = (): number => this.now().offset;
            const opener = this.now().offset;
            const closer = index.current?.[opener + 1];
            if (closer === undefined) throw new Error('Strict math parser index is unavailable');
            const withinLookahead = closer !== 0 && closer - opener <= maxLookahead;
            let preceding: Code = dollar;
            let escaped = false;

            return start;

            function start(code: Code): State | undefined {
                if (code !== dollar || !withinLookahead) return nok(code);
                effects.enter('mathText');
                effects.enter('mathTextSequence');
                effects.consume(code);
                effects.exit('mathTextSequence');
                return afterOpen;
            }

            function afterOpen(code: Code): State | undefined {
                if (code === null || code === dollar || whitespace(code)) return nok(code);
                effects.enter('mathTextData');
                return data(code);
            }

            function data(code: Code): State | undefined {
                const current = sourceOffset();
                if (code === null || current - opener > maxLookahead) return nok(code);

                if (markdownLineEnding(code)) {
                    effects.exit('mathTextData');
                    effects.enter('lineEnding');
                    effects.consume(code);
                    effects.exit('lineEnding');
                    preceding = code;
                    escaped = false;
                    return afterLineEnding;
                }

                if (code === dollar && !escaped && !whitespace(preceding) && index.current?.[current] === current) {
                    effects.exit('mathTextData');
                    effects.enter('mathTextSequence');
                    effects.consume(code);
                    return afterDollar;
                }

                effects.consume(code);
                escaped = code === backslash && !escaped;
                preceding = code;
                return data;
            }

            function afterLineEnding(code: Code): State | undefined {
                effects.enter('mathTextData');
                return data(code);
            }

            function afterDollar(code: Code): State | undefined {
                effects.exit('mathTextSequence');
                effects.exit('mathText');
                return ok(code);
            }
        },
    };
}

/** Add stock display math and strict single-dollar inline math to a remark parser. */
export function remarkMathStrict(this: Processor): void {
    this.use(remarkMath, { singleDollarTextMath: false });
    const parseMarkdown = this.parser;
    if (!parseMarkdown) throw new Error('Strict math syntax needs a remark parser');
    const index: { current: Uint32Array | undefined } = { current: undefined };
    (this.data().micromarkExtensions ??= []).push({ text: { [dollar]: strictDollarSyntax(index) } });
    this.parser = (document, file) => {
        const previous = index.current;
        index.current = eligibleClosers(document);
        try {
            return parseMarkdown(document, file);
        } finally {
            index.current = previous;
        }
    };
}
