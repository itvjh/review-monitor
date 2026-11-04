// DPAPI CurrentUser: encrypted outside the repository, readable by this Windows account only.
const { execFile } = require('child_process');
const path = require('path');
const { CodedError } = require('./errors');

exports.load = () => new Promise((resolve, reject) => {
  if (process.platform !== 'win32') return resolve(null);
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, '../../scripts/expedia-credential.ps1'), '-Action', 'load'],
    { windowsHide: true, timeout: 15000, maxBuffer: 16384 }, (err, stdout) => {
      try {
        if (err) throw err;
        const value = JSON.parse(stdout);
        if (value !== null && (typeof value.username !== 'string' || !value.username || typeof value.password !== 'string' || !value.password)) throw new Error();
        resolve(value);
      } catch { reject(new CodedError('AUTH_REQUIRED', 'Không đọc được thông tin Expedia đã mã hóa. Cần lưu lại dưới tài khoản Windows đang chạy collector.')); }
    });
});
