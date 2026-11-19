import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GoogleDriveProvider } from '../providers/GoogleDriveProvider'

describe('Storage Providers', () => {
  describe('GoogleDriveProvider', () => {
    let mockDrive: any
    let provider: GoogleDriveProvider

    beforeEach(() => {
      mockDrive = {
        files: {
          list: vi.fn().mockResolvedValue({
            data: {
              files: [
                {
                  id: 'f-1',
                  name: 'goals-2026-04-10.json',
                  modifiedTime: '2026-04-10T12:00:00Z',
                  md5Checksum: 'checksum1',
                  size: '123'
                },
                // Older duplicate that should be pruned
                {
                  id: 'f-0',
                  name: 'goals-2026-04-10.json',
                  modifiedTime: '2026-04-09T12:00:00Z',
                  md5Checksum: 'checksum0',
                  size: '120'
                }
              ]
            }
          }),
          get: vi.fn().mockResolvedValue({ data: '{"status":"ok"}' }),
          create: vi.fn().mockResolvedValue({ data: { id: 'created-id' } }),
          update: vi.fn().mockResolvedValue({ data: { id: 'updated-id' } }),
          delete: vi.fn().mockResolvedValue({})
        }
      }

      provider = new GoogleDriveProvider({
        getDriveClient: () => mockDrive,
        isConnected: () => true
      })
    })

    it('lists and deduplicates remote files by modifiedTime', async () => {
      const files = await provider.listRemoteFiles()
      expect(files).toHaveLength(1)
      expect(files[0].id).toBe('f-1')
      expect(files[0].size).toBe(123)
    })

    it('reads remote file content', async () => {
      const content = await provider.readRemoteFile('goals-2026-04-10.json', 'f-1')
      expect(content).toBe('{"status":"ok"}')
      expect(mockDrive.files.get).toHaveBeenCalledWith(
        { fileId: 'f-1', alt: 'media' },
        { responseType: 'stream' }
      )
    })

    it('creates or updates remote files', async () => {
      const created = await provider.writeRemoteFile('test.json', '{"a":1}')
      expect(created.fileId).toBe('created-id')

      const updated = await provider.writeRemoteFile('test.json', '{"a":2}', 'existing-id')
      expect(updated.fileId).toBe('updated-id')
    })
  })
})
