import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RoommateSyncProvider, useRoommateSync } from './RoommateSyncContext';

describe('RoommateSyncContext & Provider Suite', () => {
  it('renders children within RoommateSyncProvider', () => {
    const html = renderToString(
      <RoommateSyncProvider initialRealtimeLive={true}>
        <div id="test-child">Child Element</div>
      </RoommateSyncProvider>
    );

    expect(html).toContain('Child Element');
  });

  it('provides real-time live initial state and handlers', () => {
    const TestConsumer = () => {
      const sync = useRoommateSync();
      return (
        <div>
          <span id="sync-live">{sync.isRealtimeLive ? 'LIVE' : 'OFFLINE'}</span>
          <span id="sync-setter">{typeof sync.setRemoteSyncToast}</span>
        </div>
      );
    };

    const html = renderToString(
      <RoommateSyncProvider initialRealtimeLive={true}>
        <TestConsumer />
      </RoommateSyncProvider>
    );

    expect(html).toContain('LIVE');
    expect(html).toContain('function');
  });

  it('throws an error if useRoommateSync is called outside provider', () => {
    const TestConsumer = () => {
      useRoommateSync();
      return <div>Will Error</div>;
    };

    expect(() => {
      renderToString(<TestConsumer />);
    }).toThrow('useRoommateSync must be used within a RoommateSyncProvider');
  });
});
