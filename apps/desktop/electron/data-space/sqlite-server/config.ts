export const sqliteConfig: Record<string, string | number> = {
    journal_mode: 'WAL',
    synchronous: 1,
    cache_size: 1 * 1024 * 1024,
    locking_mode: 'NORMAL',
    temp_store: 'DEFAULT',
    busy_timeout: 3000,
}

export const generatePragmaList = () => {
    const pragmaList = []
    for (const key in sqliteConfig) {
        pragmaList.push(`${key} = ${sqliteConfig[key]}`)
    }
    return pragmaList
}