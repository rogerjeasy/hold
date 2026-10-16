// Puts a file to a signed link, reporting how much has gone. XMLHttpRequest, because fetch reports no upload progress.
export function putWithProgress(url: string, headers: Readonly<Record<string, string>>, blob: Blob, onProgress: (share: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    request.onload = () => {
      resolve(request.status >= 200 && request.status < 300)
    }
    request.onerror = () => {
      resolve(false)
    }
    request.send(blob)
  })
}
