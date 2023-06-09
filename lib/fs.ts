// @ts-nocheck
export function getSQLiteFilesInRootDirectory(): Promise<File[]> {
  window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
  return new Promise<File[]>((resolve, reject) => {
    window.requestFileSystem(window.TEMPORARY, 1024 * 1024, function (fs) {
      const dirReader = fs.root.createReader();
      dirReader.readEntries(function (results) {
        const sqliteFiles = results.filter(file => file.name.endsWith('.sqlite3'));
        resolve(sqliteFiles);
      });
    }, function (error) {
      reject(error);
    });
  });
}