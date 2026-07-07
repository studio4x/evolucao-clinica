const GOOGLE_API_MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableGoogleError(status: number, errorText: string) {
  if (status === 429) return true;
  if (status !== 403) return false;

  return /userRateLimitExceeded|rateLimitExceeded|quotaExceeded|usageLimits|rate limit|quota/i.test(errorText);
}

async function googleApiFetch(url: string, options: RequestInit, context: string) {
  for (let attempt = 1; attempt <= GOOGLE_API_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) {
      return response;
    }

    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error(`UNAUTHENTICATED: ${errorText}`);
    }
    if (
      response.status === 403 &&
      /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|Insufficient Permission/i.test(errorText)
    ) {
      throw new Error(`INSUFFICIENT_SCOPES: ${errorText}`);
    }

    const shouldRetry = attempt < GOOGLE_API_MAX_ATTEMPTS && isRetryableGoogleError(response.status, errorText);
    if (!shouldRetry) {
      throw new Error(`Google Drive API error (${context}): ${response.status} - ${errorText}`);
    }

    const delay = 1000 * attempt * attempt;
    console.warn(`[GoogleDocs] ${context} rate limited (${response.status}). Retrying in ${delay}ms (attempt ${attempt}/${GOOGLE_API_MAX_ATTEMPTS}).`);
    await sleep(delay);
  }

  throw new Error(`Google Drive API error (${context}): retry limit exceeded.`);
}

export async function appendToGoogleDoc(
  googleAccessToken: string,
  googleDocId: string,
  sessionDate: string,
  transcription: string,
  options?: {
    sessionTime?: string;
    evolutionId?: string;
  }
) {
  const now = new Date();
  const insertionDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const insertionTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  let formattedDate = sessionDate;
  if (sessionDate && sessionDate.includes('-')) {
    const [year, month, day] = sessionDate.split('-');
    formattedDate = `${day}/${month}/${year}`;
  }
  
  const resolvedSessionTime = options?.sessionTime || insertionTime;
  const header = `📅 DATA DA SESSÃO: ${formattedDate} às ${resolvedSessionTime}`;
  
  const uniqueId = options?.evolutionId || 'N/A';
  
  const divider = "────────────────────────────────────────────────────────";
  const footer = `${divider}\n🔒 REGISTRO DE INSERÇÃO SISTÊMICA\n• Aplicativo: Evolução Clínica\n• Inserido em: ${insertionDate} às ${insertionTime}\n• Chave de autenticidade: ${uniqueId}\n${divider}`;
  
  const textToAppend = `${header}\n\nEvolução:\n${transcription}\n\n${footer}\n\n\n`;

  const googleDocsUrl = `https://docs.googleapis.com/v1/documents/${googleDocId}:batchUpdate`;
  
  const response = await googleApiFetch(googleDocsUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: textToAppend,
          },
        },
      ],
    })
  }, 'Doc append');

  return await response.json();
}

export async function appendTextToGoogleDoc(
  googleAccessToken: string,
  googleDocId: string,
  text: string
) {
  const googleDocsUrl = `https://docs.googleapis.com/v1/documents/${googleDocId}:batchUpdate`;
  
  const response = await googleApiFetch(googleDocsUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: text + "\n\n----------------------------------------\n\n",
          },
        },
      ],
    })
  }, 'Doc append');

  return await response.json();
}

export async function createGoogleDoc(googleAccessToken: string, title: string, folderId?: string) {
  const url = `https://www.googleapis.com/drive/v3/files`;
  
  const body: any = {
    name: title,
    mimeType: 'application/vnd.google-apps.document'
  };

  if (folderId) {
    body.parents = [folderId];
  }
  
  const response = await googleApiFetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, 'Doc create');

  const data = await response.json();
  return {
    id: data.id,
    name: data.name,
    url: `https://docs.google.com/document/d/${data.id}/edit`
  };
}

export async function listGoogleFiles(googleAccessToken: string, parentId: string = 'root', searchTerm: string = '', isGlobalSearch: boolean = false) {
  let q = `trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.document')`;
  
  if (searchTerm) {
    q += ` and name contains '${searchTerm.replace(/'/g, "\\'")}'`;
    if (!isGlobalSearch) {
      q += ` and '${parentId}' in parents`;
    }
  } else {
    q += ` and '${parentId}' in parents`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=50`;

  const response = await googleApiFetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
    }
  }, 'List');

  const data = await response.json();
  return data.files || [];
}

export async function createGoogleFolder(googleAccessToken: string, folderName: string, parentFolderId?: string) {
  const url = `https://www.googleapis.com/drive/v3/files`;
  
  const body: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentFolderId) {
    body.parents = [parentFolderId];
  }
  
  const response = await googleApiFetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, 'Folder create');

  return await response.json();
}

export async function deleteGoogleFile(googleAccessToken: string, fileId: string) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  
  const response = await googleApiFetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`
    }
  }, 'Delete');

  return true;
}

export async function getGoogleDocContent(googleAccessToken: string, googleDocId: string): Promise<string> {
  const url = `https://docs.googleapis.com/v1/documents/${googleDocId}`;
  
  const response = await googleApiFetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
    }
  }, 'Doc get');

  const doc = await response.json();
  
  let text = '';
  if (doc.body && doc.body.content) {
    doc.body.content.forEach((element: any) => {
      if (element.paragraph) {
        element.paragraph.elements.forEach((el: any) => {
          if (el.textRun && el.textRun.content) {
            text += el.textRun.content;
          }
        });
      } else if (element.table) {
        element.table.tableRows.forEach((row: any) => {
          row.tableCells.forEach((cell: any) => {
            if (cell.content) {
              cell.content.forEach((cellElement: any) => {
                if (cellElement.paragraph) {
                  cellElement.paragraph.elements.forEach((el: any) => {
                    if (el.textRun && el.textRun.content) {
                      text += el.textRun.content;
                    }
                  });
                }
              });
            }
          });
        });
      }
    });
  }
  return text;
}

export async function updateGoogleDocContent(
  googleAccessToken: string,
  googleDocId: string,
  newText: string
) {
  // 1. Obter o documento para saber a posição final (endIndex) do corpo
  const getUrl = `https://docs.googleapis.com/v1/documents/${googleDocId}`;
  const getResponse = await googleApiFetch(getUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
    }
  }, 'Doc get for update');

  const doc = await getResponse.json();
  const content = doc.body.content;
  const lastElement = content[content.length - 1];
  const endIndex = lastElement.endIndex;

  const requests: any[] = [];

  // Apaga todo o conteúdo existente entre o índice 1 e o final (menos o \n terminal obrigatório)
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: endIndex - 1
        }
      }
    });
  }

  // Insere o novo texto no índice 1
  requests.push({
    insertText: {
      location: { index: 1 },
      text: newText
    }
  });

  const updateUrl = `https://docs.googleapis.com/v1/documents/${googleDocId}:batchUpdate`;
  const updateResponse = await googleApiFetch(updateUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  }, 'Doc update');

  return await updateResponse.json();
}

export async function getFolderHierarchy(
  googleAccessToken: string,
  folderId: string
): Promise<{ id: string; name: string }[]> {
  const hierarchy: { id: string; name: string }[] = [];
  let currentId = folderId;
  let depth = 0;
  const maxDepth = 5;

  while (currentId && depth < maxDepth) {
    const url = `https://www.googleapis.com/drive/v3/files/${currentId}?fields=id,name,parents`;
    const response = await googleApiFetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
      }
    }, 'Folder hierarchy');

    const data = await response.json();
    if (!data.id) break;

    hierarchy.push({ id: data.id, name: data.name });

    if (data.parents && data.parents.length > 0) {
      currentId = data.parents[0];
      depth++;
    } else {
      break;
    }
  }

  return hierarchy.reverse();
}

export async function uploadPdfToGoogleDrive(
  googleAccessToken: string,
  pdfBlob: Blob,
  fileName: string,
  parentFolderId?: string
) {
  const metadata = {
    name: fileName,
    mimeType: 'application/pdf',
    parents: parentFolderId ? [parentFolderId] : undefined
  };

  const boundary = 'foo_bar_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const reader = new FileReader();
  const base64Promise = new Promise<string>((resolve) => {
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(pdfBlob);
  });

  const base64Data = await base64Promise;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/pdf\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data +
    closeDelimiter;

  const response = await googleApiFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    },
    'PDF upload'
  );

  return await response.json();
}
