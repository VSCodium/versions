const crypto = require('crypto')
const https = require('https')
const cp = require('child_process')
const fs = require('fs')

const BASE='https://raw.githubusercontent.com/VSCodium/versions/master/'

const TYPES = {
  win32Archive: 'win32/ia32/archive/',
  win64Archive: 'win32/x64/archive/',
  win32System: 'win32/ia32/system/',
  win64System: 'win32/x64/system/',
  win32User: 'win32/ia32/user/',
  win64User: 'win32/x64/user/',
  darwin: 'darwin/',
  linux32: 'linux/ia32/',
  linux64: 'linux/x64/'
}

const FILENAME = 'latest.json'

function getSums (data) {
  let h = crypto.createHash('sha256')
  h.update(data)
  const sha256 = h.digest('hex')

  h = crypto.createHash('sha1')
  h.update(data)
  const sha1 = h.digest('hex')

  return { sha256, sha1 }
}

function getFile (url) {
  // the "easy way"; returns file buffer
  const filename = url.substring(url.lastIndexOf('/')+1)
  cp.execSync(`curl -Lso /tmp/${filename} ${url}`)
  const contents = fs.readFileSync(`/tmp/${filename}`)
  fs.unlinkSync(`/tmp/${filename}`) // delete tmp file
  return contents
}

function getJson (type) {
  return new Promise((resolve, reject) => {
    https.get(`${BASE}${type}${FILENAME}`, (res) => {
    const { statusCode } = res;
    if (statusCode > 200) {
      res.resume()
      reject(new Error(`could not get version json for ${type}`))
      return
    }
  
    res.setEncoding('utf8')
    let rawData = ''
    res.on('data', (chunk) => { rawData += chunk })
    res.on('end', () => {
      try {
        const parsedData = JSON.parse(rawData)
        resolve(parsedData)
      } catch (e) {
        reject(e)
      }
    })
  }).on('error', (e) => {
    reject(e)
  })
  })
}

function compareSums (sums, json) {
  return sums.sha256 === json.sha256hash && sums.sha1 === json.hash
}


async function validateAssets (throwErrors = false) {
  const results = {}
  for (let type in TYPES) {
    console.log('Checking', type, '...')
    try {
      const json = await getJson(TYPES[type])
      console.log('Got version JSON. Downloading asset ...')
      const file = await getFile(json.url)
      console.log('Downloaded asset. Computing sums ...')
      const sums = await getSums(file)
      const valid = compareSums(sums, json)
      if (!valid && throwErrors) throw new Error(`Invalid hashes for ${type} ${json.productVersion}`)
      results[type] = valid
        ? `Hashes match (${json.productVersion})`
        : `Invalid hashes (${json.productVersion}) - (want: ${sums.sha256}, got: ${json.sha256hash}), (want: ${sums.sha1}, got: ${json.hash})`
      console.log(results[type])
    } catch (e) {
      if (throwErrors) throw e
      console.log('Encountered an error, skipping ...')
      results[type] = `Error: ${e.message}`
    }
  }
  console.log('Summary:')
  console.log(JSON.stringify(results, null, 4))
}

validateAssets(process.argv[2] === 'test')
