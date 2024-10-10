import fs from 'node:fs/promises'
import { join } from 'node:path'
import config from 'native-file-system-adapter/src/config'
import { errors } from 'native-file-system-adapter/src/util'
import { Blob } from 'buffer';

const { DOMException } = config
const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX } = errors



interface WriteChunk {
    type: 'write';
    position?: number;
    data: Uint8Array | string | ArrayBuffer | Blob;
}

interface SeekChunk {
    type: 'seek';
    position: number;
}

interface TruncateChunk {
    type: 'truncate';
    size: number;
}

type Chunk = WriteChunk | SeekChunk | TruncateChunk;

function isBlob(object: any): object is Blob {
    return (
        object &&
        typeof object === 'object' &&
        typeof object.constructor === 'function' &&
        (
            typeof object.stream === 'function' ||
            typeof object.arrayBuffer === 'function'
        ) &&
        /^(Blob|File)$/.test(object[Symbol.toStringTag])
    )
}

function isChunk(object: any): object is Chunk {
    return object && typeof object === 'object' && 'type' in object;
}

export class Sink {
    private _fileHandle: fs.FileHandle;
    private _size: number;
    private _position: number;

    constructor(fileHandle: fs.FileHandle, size: number) {
        this._fileHandle = fileHandle
        this._size = size
        this._position = 0
    }

    abort = async () => {
        await this._fileHandle.close()
    }

    write = async (chunk: Chunk | Uint8Array | string | ArrayBuffer | Blob) => {
        if (isChunk(chunk)) {
            if (chunk.type === 'write') {
                if (chunk.position !== undefined && Number.isInteger(chunk.position) && chunk.position >= 0) {
                    this._position = chunk.position
                }
                if (!('data' in chunk)) {
                    await this._fileHandle.close()
                    throw new DOMException(...SYNTAX('write requires a data argument'))
                }
                chunk = chunk.data
            } else if (chunk.type === 'seek') {
                if (Number.isInteger(chunk.position) && chunk.position >= 0) {
                    if (this._size < chunk.position) {
                        throw new DOMException(...INVALID)
                    }
                    this._position = chunk.position
                    return
                } else {
                    await this._fileHandle.close()
                    throw new DOMException(...SYNTAX('seek requires a position argument'))
                }
            } else if (chunk.type === 'truncate') {
                if (Number.isInteger(chunk.size) && chunk.size >= 0) {
                    await this._fileHandle.truncate(chunk.size)
                    this._size = chunk.size
                    if (this._position > this._size) {
                        this._position = this._size
                    }
                    return
                } else {
                    await this._fileHandle.close()
                    throw new DOMException(...SYNTAX('truncate requires a size argument'))
                }
            }
        }

        if (chunk instanceof ArrayBuffer) {
            chunk = new Uint8Array(chunk)
        } else if (typeof chunk === 'string') {
            chunk = Buffer.from(chunk)
        } else if (isBlob(chunk)) {
            for await (const data of chunk.stream()) {
                const res = await this._fileHandle.writev([data], this._position)
                this._position += res.bytesWritten
                this._size += res.bytesWritten
            }
            return
        }

        if (!(chunk instanceof Uint8Array)) {
            throw new TypeError('Chunk must be of type Uint8Array')
        }

        const res = await this._fileHandle.writev([chunk], this._position)
        this._position += res.bytesWritten
        this._size += res.bytesWritten
    }

    close = async () => {
        await this._fileHandle.close()
    }
}

export class FileHandle {
    private _path: string;
    public name: string;
    public kind: 'file';

    constructor(path: string, name: string) {
        this._path = path
        this.name = name
        this.kind = 'file'
    }

    getFile = async () => {
        await fs.stat(this._path).catch(err => {
            if (err.code === 'ENOENT') throw new DOMException(...GONE)
        })

        const data = await fs.readFile(this._path);
        return new Blob([data]);
    }

    isSameEntry = async (other: FileHandle) => {
        return this._path === other._getPath()
    }

    private _getPath = () => {
        return this._path
    }

    createWritable = async (opts: { keepExistingData: boolean }) => {
        const fileHandle = await fs.open(this._path, opts.keepExistingData ? 'r+' : 'w+').catch(err => {
            if (err.code === 'ENOENT') throw new DOMException(...GONE)
            throw err
        })
        const { size } = await fileHandle.stat()
        return new Sink(fileHandle, size)
    }
}

export class FolderHandle {
    private _path: string;
    public name: string;
    public kind: 'directory';

    constructor(path: string = '', name: string = '') {
        this.name = name
        this.kind = 'directory'
        this._path = path
        this.entries = this.entries.bind(this)
        this.getDirectoryHandle = this.getDirectoryHandle.bind(this)
        this.getFileHandle = this.getFileHandle.bind(this)
        this.queryPermission = this.queryPermission.bind(this)
        this.removeEntry = this.removeEntry.bind(this)
        this.isSameEntry = this.isSameEntry.bind(this)
    }

    isSameEntry = async (other: FolderHandle) => {
        return this._path === other._path
    }

    async *entries(): AsyncGenerator<[string, FileHandle | FolderHandle]> {
        const dir = this._path
        const items = await fs.readdir(dir).catch(err => {
            if (err.code === 'ENOENT') throw new DOMException(...GONE)
            throw err
        })
        for (let name of items) {
            const path = join(dir, name)
            const stat = await fs.lstat(path)
            if (stat.isFile()) {
                yield [name, new FileHandle(path, name)]
            } else if (stat.isDirectory()) {
                yield [name, new FolderHandle(path, name)]
            }
        }
    }

    getDirectoryHandle = async (name: string, opts: { create: boolean }) => {
        const path = join(this._path, name)
        const stat = await fs.lstat(path).catch(err => {
            if (err.code !== 'ENOENT') throw err
        })
        const isDirectory = stat?.isDirectory()
        if (stat && isDirectory) return new FolderHandle(path, name)
        if (stat && !isDirectory) throw new DOMException(...MISMATCH)
        if (!opts.create) throw new DOMException(...GONE)
        await fs.mkdir(path)
        return new FolderHandle(path, name)
    }

    getFileHandle = async (name: string, opts: { create: boolean }) => {
        const path = join(this._path, name)
        const stat = await fs.lstat(path).catch(err => {
            if (err.code !== 'ENOENT') throw err
        })
        const isFile = stat?.isFile()
        if (stat && isFile) return new FileHandle(path, name)
        if (stat && !isFile) throw new DOMException(...MISMATCH)
        if (!opts.create) throw new DOMException(...GONE)
        await (await fs.open(path, 'w')).close()
        return new FileHandle(path, name)
    }

    queryPermission = async () => {
        return 'granted'
    }

    removeEntry = async (name: string, opts: { recursive: boolean }) => {
        const path = join(this._path, name)
        const stat = await fs.lstat(path).catch(err => {
            if (err.code === 'ENOENT') throw new DOMException(...GONE)
            throw err
        })
        if (stat.isDirectory()) {
            if (opts.recursive) {
                await fs.rm(path, { recursive: true }).catch(err => {
                    if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
                    throw err
                })
            } else {
                await fs.rmdir(path).catch(err => {
                    if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
                    throw err
                })
            }
        } else {
            await fs.unlink(path)
        }
    }
}

export default (path: string) => new FolderHandle(path)