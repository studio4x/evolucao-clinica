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

export async function createGoogleDoc(googleAccessToken: string, title: string, folderId?: string) {
  // Usamos a Drive API em vez da Docs API para poder especificar a pasta (parents)
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
    throw new Error(`Google Drive API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    name: data.name,
    url: `https://docs.google.com/document/d/${data.id}/edit`
  };
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
