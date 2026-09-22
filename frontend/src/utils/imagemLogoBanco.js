// Redimensiona a imagem de uma logomarca de banco antes de enviar — diferente de
// redimensionarImagem() (foto de perfil, utils/imagemPerfil.js), que sempre corta em
// quadrado: uma logo pode ser retangular (ex.: uma wordmark), então aqui só reduz se for
// maior que `ladoMaximo`, preservando a proporção original e a transparência (sempre sai
// como PNG, mesmo que o arquivo original seja JPEG/WEBP/SVG).
export function redimensionarLogoBanco(file, { ladoMaximo = 128 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não é uma imagem válida.'));
      img.onload = () => {
        // SVG sem width/height nem viewBox às vezes carrega com naturalWidth/Height 0 —
        // cai pro tamanho máximo em vez de gerar um canvas vazio.
        const largOriginal = img.naturalWidth || ladoMaximo;
        const altOriginal = img.naturalHeight || ladoMaximo;
        const maior = Math.max(largOriginal, altOriginal);
        const escala = Math.min(1, ladoMaximo / maior);
        const largura = Math.max(1, Math.round(largOriginal * escala));
        const altura = Math.max(1, Math.round(altOriginal * escala));

        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;
        canvas.getContext('2d').drawImage(img, 0, 0, largura, altura);

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
