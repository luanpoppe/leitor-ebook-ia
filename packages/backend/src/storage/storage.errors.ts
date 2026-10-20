/**
 * Erros de domínio do armazenamento de arquivos.
 * Camadas superiores (services/controllers) traduzem estes erros para HTTP.
 */

export class StorageUnavailableError extends Error {
  constructor(message = 'O armazenamento de arquivos não está configurado.') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export class StorageObjectNotFoundError extends Error {
  readonly storageKey: string;

  constructor(storageKey: string) {
    super(`Objeto não encontrado no armazenamento: ${storageKey}.`);
    this.name = 'StorageObjectNotFoundError';
    this.storageKey = storageKey;
  }
}

export class InvalidStorageInputError extends Error {
  constructor(message = 'Os dados informados para o armazenamento são inválidos.') {
    super(message);
    this.name = 'InvalidStorageInputError';
  }
}
