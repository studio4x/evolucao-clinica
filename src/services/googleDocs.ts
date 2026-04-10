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
