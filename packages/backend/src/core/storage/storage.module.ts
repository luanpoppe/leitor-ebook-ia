import { Global, Module } from '@nestjs/common';
import { MINIO_CLIENT, storageProvider } from './storage.provider';

@Global()
@Module({
  providers: [storageProvider],
  exports: [MINIO_CLIENT],
})
export class StorageModule {}
