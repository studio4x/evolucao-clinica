import { useEffect } from 'react';

export const PushManager = () => {
  useEffect(() => {
    // Escuta aceite de cookies antes de pedir permissão de push
    const handlePushInit = async () => {
      if (!("Notification" in window)) return;
      
      if (Notification.permission === "default") {
        // Aguarda 5 segundos após aceitar cookies para não sobrecarregar o usuário
        setTimeout(async () => {
          try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
              console.log("[Push] Permissão concedida");
              // Aqui entraria a lógica de registrar a subscription no Supabase
            }
          } catch (error) {
            console.error("[Push] Erro ao solicitar permissão:", error);
          }
        }, 5000);
      }
    };

    window.addEventListener("cookie-consent-accepted", handlePushInit);
    
    // Se já tiver aceito anteriormente
    if (localStorage.getItem('cookie-consent') === 'true') {
      handlePushInit();
    }

    return () => window.removeEventListener("cookie-consent-accepted", handlePushInit);
  }, []);

  return null;
};
