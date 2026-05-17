import type { Doc, Id } from '../_generated/dataModel';
import {
  DEFAULT_INSPECTOR_MEMORY_LIMIT,
  MAX_INSPECTOR_MEMORY_LIMIT,
  inspectorMemoryPayload,
  normalizeInspectorMemoryLimit,
} from './memory';

describe('inspector memory helpers', () => {
  test('normalizes memory limits for the inspector query', () => {
    expect(normalizeInspectorMemoryLimit(undefined)).toBe(DEFAULT_INSPECTOR_MEMORY_LIMIT);
    expect(normalizeInspectorMemoryLimit(12.8)).toBe(12);
    expect(normalizeInspectorMemoryLimit(-1)).toBe(0);
    expect(normalizeInspectorMemoryLimit(MAX_INSPECTOR_MEMORY_LIMIT + 20)).toBe(
      MAX_INSPECTOR_MEMORY_LIMIT,
    );
  });

  test('returns UI-safe memory metadata without embedding references', () => {
    const memory = {
      _id: 'memory-id' as Id<'memories'>,
      _creationTime: 1234,
      playerId: 'p:1',
      description: 'Lucky remembered the cafe burner.',
      embeddingId: 'embedding-id' as Id<'memoryEmbeddings'>,
      importance: 7,
      lastAccess: 5678,
      data: {
        type: 'relationship',
        playerId: 'p:2',
      },
    } as Doc<'memories'>;

    const payload = inspectorMemoryPayload(memory);

    expect(payload).toEqual({
      id: 'memory-id',
      description: 'Lucky remembered the cafe burner.',
      importance: 7,
      type: 'relationship',
      data: {
        type: 'relationship',
        playerId: 'p:2',
      },
      createdAt: 1234,
      lastAccess: 5678,
    });
    expect(payload).not.toHaveProperty('embeddingId');
  });
});
