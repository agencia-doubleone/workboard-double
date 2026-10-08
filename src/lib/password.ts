// Gerador de senhas usado no navegador (botão "gerar") e no servidor (senha
// automática ao criar usuário). Web Crypto existe nos dois ambientes.

// Sem caracteres ambíguos (0/O, 1/l/I) para facilitar repassar a senha.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generatePassword(length = 16) {
  // Descarta bytes acima do maior múltiplo do alfabeto para não enviesar.
  const limit = 256 - (256 % ALPHABET.length);
  let result = "";
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && result.length < length) result += ALPHABET[byte % ALPHABET.length];
    }
  }
  return result;
}
