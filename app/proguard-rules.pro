# Regras específicas do Evolução Clínica.
#
# O WebView acessa estes métodos pelo nome via addJavascriptInterface().
# Mantemos somente os membros anotados, permitindo que o R8 continue
# removendo, otimizando e ofuscando o restante do código normalmente.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserva os atributos de anotação usados pela regra acima.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations
