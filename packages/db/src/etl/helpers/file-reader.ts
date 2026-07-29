import { extname } from 'path';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { Tokenizer, TokenParser } from '@streamparser/json';
import { pipeline } from 'node:stream';

export class FileReader<SourceRecord> {
    createJSONStream(filePath: string) {
        return (async function* () {
            const buffer: SourceRecord[] = [];

            const tokenizer = new Tokenizer({ stringBufferSize: 64 * 1024 });
            const tokenParser = new TokenParser({ paths: ['$.*'] });

            tokenizer.onToken = tokenParser.write.bind(tokenParser);
            tokenParser.onValue = ({ value }) => {
                if (value !== undefined) {
                    buffer.push(value as SourceRecord);
                }
            };

            const stream = createReadStream(filePath);

            for await (const chunk of stream) {
                tokenizer.write(chunk);
                
                while (buffer.length > 0) {
                    yield buffer.shift()!;
                }
            }
        })();
    }

    createCSVFileStream(filePath: string) {
        const fileStream = createReadStream(filePath);
        const parser = parse({ columns: true, relax_column_count: true, relax_quotes: true, bom: true });

        return pipeline(fileStream, parser, (err) => {
            if (err) {
                parser.destroy(err);
            }
        });
    }

    createFileReadStream(filePath: string): AsyncIterable<SourceRecord> | undefined {
        const extension = extname(filePath);
        let fs;

        switch (extension) {
            case '.csv':
                fs = this.createCSVFileStream(filePath)
                break;
            case '.json':
                fs = this.createJSONStream(filePath)
                break;
            default:
                return undefined
        }

        return fs as unknown as AsyncIterable<SourceRecord>
    }
}
