const fs = require('fs');
const https = require('https');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', reject);
  });
}

Promise.all([
  download('https://ui-avatars.com/api/?name=CS&background=005C13&color=fff&size=192', 'public/icon-192.png'),
  download('https://ui-avatars.com/api/?name=CS&background=005C13&color=fff&size=512', 'public/icon-512.png')
]).then(() => console.log('Icons downloaded successfully.'));
