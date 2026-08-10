export function flagUrl(code: string, width = 80) {
  const cleanCode = code.trim().toLowerCase();

  if (!/^[a-z]{2}$/.test(cleanCode)) return "";

  return `https://flagcdn.com/w${width}/${cleanCode}.png`;
}
