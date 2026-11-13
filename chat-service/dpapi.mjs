// Windows CurrentUser encryption. Plaintext travels only through private pipes.
import { spawn } from 'node:child_process';
const script = `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$data=[Convert]::FromBase64String([Console]::In.ReadToEnd())
if($env:NEWTAB_DPAPI_MODE -eq 'encrypt'){
$out=[Security.Cryptography.ProtectedData]::Protect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
}else{
$out=[Security.Cryptography.ProtectedData]::Unprotect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
}
[Console]::Out.Write([Convert]::ToBase64String($out))`;
function transform(mode, bytes) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Windows credential encryption is required.'));
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, env: { ...process.env, NEWTAB_DPAPI_MODE: mode }, stdio: ['pipe', 'pipe', 'pipe']
    });
    let output = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 2_000_000) child.kill(); });
    child.stderr.resume(); // Never forward decrypted material or subprocess errors to logs.
    child.on('error', () => { clearTimeout(timer); reject(new Error('Credential encryption could not start.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.from(output.trim(), 'base64')) : reject(new Error('Credential encryption failed.')); });
    child.stdin.on('error', () => {});
    child.stdin.end(Buffer.from(bytes).toString('base64'));
  });
}
export const encryption = {
  id: 'windows-dpapi-current-user-v1',
  isAvailable: () => process.platform === 'win32',
  encrypt: text => transform('encrypt', Buffer.from(text, 'utf8')),
  decrypt: async bytes => (await transform('decrypt', bytes)).toString('utf8')
};
