export interface DBModel {
    name: string;
    ID: string;
    bytes: Uint8Array;
}

export interface DBTokenizer {
    bytes: Uint8Array;
    modelID: string;
}
