import {
  prepareEngineForRestore,
  remapMemoryDocForRestore,
  remapWorldIdField,
  sanitizeWorldDocForSave,
} from './testing';

describe('save snapshot helpers', () => {
  test('clears transient world state before saving', () => {
    const sanitized = sanitizeWorldDocForSave({
      nextId: 10,
      historicalLocations: [{ playerId: 'p:1', location: new ArrayBuffer(0) }],
      agents: [
        {
          id: 'a:1',
          playerId: 'p:1',
          inProgressOperation: { name: 'agentGenerateMessage', operationId: 'o:1', started: 1 },
        },
      ],
      conversations: [
        {
          id: 'c:1',
          creator: 'p:1',
          created: 1,
          numMessages: 2,
          isTyping: { playerId: 'p:1', messageUuid: 'm1', since: 1 },
          participants: [],
        },
      ],
    });

    expect(sanitized.historicalLocations).toBeUndefined();
    expect(sanitized.agents[0].inProgressOperation).toBeUndefined();
    expect(sanitized.conversations[0].isTyping).toBeUndefined();
  });

  test('restores engines stopped with input progress reset', () => {
    const restored = prepareEngineForRestore({
      currentTime: 100,
      lastStepTs: 80,
      processedInputNumber: 12,
      running: true,
      generationNumber: 3,
    });

    expect(restored.running).toBe(false);
    expect(restored.processedInputNumber).toBeUndefined();
    expect(restored.generationNumber).toBe(3);
  });

  test('remaps world IDs and memory references', () => {
    const worldIdMap = new Map([['oldWorld', 'newWorld']]);
    const embeddingIdMap = new Map([['oldEmbedding', 'newEmbedding']]);
    const memoryIdMap = new Map([['oldMemory', 'newMemory']]);

    expect(remapWorldIdField({ worldId: 'oldWorld', value: 1 }, worldIdMap)).toEqual({
      worldId: 'newWorld',
      value: 1,
    });
    expect(
      remapMemoryDocForRestore(
        {
          playerId: 'p:1',
          description: 'Thinking',
          embeddingId: 'oldEmbedding',
          importance: 1,
          lastAccess: 2,
          data: { type: 'reflection', relatedMemoryIds: ['oldMemory', 'missingMemory'] },
        },
        embeddingIdMap,
        memoryIdMap,
      ),
    ).toMatchObject({
      embeddingId: 'newEmbedding',
      data: { relatedMemoryIds: ['newMemory', 'missingMemory'] },
    });
  });
});
