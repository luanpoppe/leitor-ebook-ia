/**
 * Copia texto para a área de transferência.
 *
 * `navigator.clipboard` só existe em contexto seguro (HTTPS/localhost); o app
 * também é aberto pelo IP da rede em HTTP, então há um fallback com textarea +
 * execCommand.
 */
export class ClipboardUtils {
  static async copy(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Permissão negada ou contexto sem clipboard: tenta o fallback.
      }
    }

    return ClipboardUtils.copyWithTextarea(text);
  }

  private static copyWithTextarea(text: string): boolean {
    if (typeof document === 'undefined') return false;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}
