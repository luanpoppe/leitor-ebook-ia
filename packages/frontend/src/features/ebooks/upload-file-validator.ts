import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  SUPPORTED_FORMATS_LABEL,
} from "./constants";

// Validação compartilhada entre a dropzone da estante e os protótipos do
// laboratório: o arquivo é o mesmo, só a aparência da área muda.
export class UploadFileValidator {
  static validate(file: File): string | null {
    const extension = UploadFileValidator.readExtension(file.name);
    const isExtensionAccepted = ACCEPTED_EXTENSIONS.some(
      (accepted) => accepted === extension
    );

    if (!isExtensionAccepted) {
      return `Formato não suportado. Envie ${SUPPORTED_FORMATS_LABEL}.`;
    }

    const isOverSizeLimit = file.size > MAX_UPLOAD_BYTES;
    if (isOverSizeLimit) {
      return `O arquivo excede o limite de ${MAX_UPLOAD_LABEL}.`;
    }

    return null;
  }

  // Sem ponto no nome (ou com ponto só no início, tipo `.epub`) não existe
  // extensão para validar, então o arquivo é rejeitado.
  private static readExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex <= 0) return "";

    return fileName.slice(lastDotIndex + 1).toLowerCase();
  }
}
