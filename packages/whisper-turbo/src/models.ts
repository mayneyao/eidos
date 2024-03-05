import { Result } from "true-myth";
import ModelDB from "./db/modelDB";
import { DBModel } from "./db/types";

export enum AvailableModels {
    WHISPER_TINY = "tiny",
    WHISPER_BASE = "base",
    WHISPER_SMALL = "small",
    WHISPER_MEDIUM = "medium",
    WHISPER_LARGE = "large",
}

export const ModelSizes: Map<AvailableModels, number> = new Map([
    [AvailableModels.WHISPER_TINY, 51444634],
    [AvailableModels.WHISPER_BASE, 96834130],
    [AvailableModels.WHISPER_SMALL, 313018088],
    [AvailableModels.WHISPER_MEDIUM, 972263884],
    [AvailableModels.WHISPER_LARGE, 1954315876],
]);

export class Model {
    name: string;
    data: Uint8Array;
    tokenizer: Uint8Array;

    constructor(name: string, data: Uint8Array, tokenizer: Uint8Array) {
        this.name = name;
        this.data = data;
        this.tokenizer = tokenizer;
    }

    static async fromDBModel(
        dbModel: DBModel,
        db: ModelDB
    ): Promise<Result<Model, Error>> {
        const tokenizerResult = await db.getTokenizer(dbModel.ID);
        if (tokenizerResult.isErr) {
            return Result.err(tokenizerResult.error);
        }
        const tokenizerBytes = tokenizerResult.value.bytes;

        return Result.ok(
            new Model(dbModel.name, dbModel.bytes, tokenizerBytes)
        );
    }
}

export interface EncoderDecoder {
    name: string;
    encoder: Model;
    decoder: Model;
    config: Uint8Array;
    tokenizer: Uint8Array;
}
