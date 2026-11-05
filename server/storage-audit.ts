import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Metadata only: never log screenshots, application contents or environment secrets.
export async function auditStorage() {
  const root = path.resolve(process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'));
  const files: {path:string;bytes:number;modifiedAt:string}[] = [];
  let skippedSymlinks = 0;
  async function walk(dir:string) {
    for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
      const file = path.join(dir,entry.name);
      if (entry.isSymbolicLink()) { skippedSymlinks++; continue; }
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const info = await fs.stat(file);
        files.push({path:path.relative(root,file),bytes:info.size,modifiedAt:info.mtime.toISOString()});
      }
    }
  }
  await fs.mkdir(root,{recursive:true});
  await walk(root);
  const disk = await fs.statfs(root);
  console.log(JSON.stringify({event:'storage_audit',root,fileCount:files.length,
    totalFileBytes:files.reduce((sum,file)=>sum+file.bytes,0),
    filesystemTotalBytes:disk.blocks*disk.bsize,filesystemAvailableBytes:disk.bavail*disk.bsize,
    skippedSymlinks,files:files.sort((a,b)=>b.bytes-a.bytes)}));
}
