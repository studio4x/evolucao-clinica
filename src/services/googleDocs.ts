export async function appendToGoogleDoc(
  googleAccessToken: string,
  googleDocId: string,
  sessionDate: string,
  transcription: string
) {
  const now = new Date();
  const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  let formattedDate = sessionDate;
  if (sessionDate && sessionDate.includes('-')) {
    const [year, month, day] = sessionDate.split('-');
    formattedDate = `${day}/${month}/${year}`;
  }
  
  const textToAppend = `Data da sessão: ${formattedDate} às ${formattedTime}\n\nEvolução:\n${transcription}\n\n----------------------------------------\n\n`;

  const googleDocsUrl = `https://docs.googleapis.com/v1/documents/${googleDocId}:batchUpdate`;
  
  const response = await fetch(googleDocsUrl, {
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Docs API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

export async function appendTextToGoogleDoc(
  googleAccessToken: string,
  googleDocId: string,
  text: string
) {
  const googleDocsUrl = `https://docs.googleapis.com/v1/documents/${googleDocId}:batchUpdate`;
  
  const response = await fetch(googleDocsUrl, {
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Docs API error: ${response.status} - ${errorText}`);
  }

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
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Drive API error (Doc): ${response.status} - ${errorText}`);
  }

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

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Drive API error (List): ${response.status} - ${errorText}`);
  }

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
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Drive API error (Folder): ${response.status} - ${errorText}`);
  }

  return await response.json();
}

export async function deleteGoogleFile(googleAccessToken: string, fileId: string) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Drive API error (Delete): ${response.status} - ${errorText}`);
  }

  return true;
}

export async function getGoogleDocContent(googleAccessToken: string, googleDocId: string): Promise<string> {
  const url = `https://docs.googleapis.com/v1/documents/${googleDocId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Docs API error (Get): ${response.status} - ${errorText}`);
  }

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
  const getResponse = await fetch(getUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
    }
  });

  if (!getResponse.ok) {
    const errorText = await getResponse.text();
    if (getResponse.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Docs API error (Get for Update): ${getResponse.status} - ${errorText}`);
  }

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
  const updateResponse = await fetch(updateUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    if (updateResponse.status === 401) {
      throw new Error("UNAUTHENTICATED: " + errorText);
    }
    throw new Error(`Google Docs API error (Update): ${updateResponse.status} - ${errorText}`);
  }

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
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
      }
    });

    if (!response.ok) {
      break;
    }

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
