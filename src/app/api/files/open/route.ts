import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const targetPath = body.path;
  const reveal = body.reveal === true;

  if (!targetPath || typeof targetPath !== 'string') {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  const platform = process.platform;
  let file: string;
  let args: string[];

  if (reveal) {
    // Reveal/select the item in its parent folder.
    if (platform === 'darwin') {
      file = 'open';
      args = ['-R', targetPath];
    } else if (platform === 'win32') {
      // explorer /select,"<path>" highlights the item
      file = 'explorer';
      args = [`/select,${targetPath}`];
    } else {
      // Linux: most file managers don't have a portable "reveal" CLI.
      // Fall back to opening the parent directory.
      file = 'xdg-open';
      args = [path.dirname(targetPath)];
    }
  } else {
    if (platform === 'darwin') {
      file = 'open';
      args = [targetPath];
    } else if (platform === 'win32') {
      file = 'explorer';
      args = [targetPath];
    } else {
      file = 'xdg-open';
      args = [targetPath];
    }
  }

  return new Promise<NextResponse>((resolve) => {
    execFile(file, args, (err) => {
      // Windows `explorer` exits with code 1 even on success when used with /select.
      // Treat any non-ENOENT error as success on win32 explorer reveal.
      if (err && !(platform === 'win32' && file === 'explorer')) {
        resolve(NextResponse.json({ error: err.message }, { status: 500 }));
      } else {
        resolve(NextResponse.json({ ok: true }));
      }
    });
  });
}
