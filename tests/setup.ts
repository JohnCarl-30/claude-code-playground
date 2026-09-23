import "@testing-library/jest-dom";
import { ReadableStream, TextDecoderStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";

// jsdom lacks some web APIs the Runner uses to read the NDJSON stream.
Object.assign(globalThis, { ReadableStream, TextDecoderStream, TextEncoder, TextDecoder });
