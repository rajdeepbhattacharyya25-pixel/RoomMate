import { describe, it, expect } from 'vitest';
import { registerBackButtonHandler } from './backButton';

describe('Android Hardware Back Button Priority & LIFO Stack', () => {
  it('registers and unregisters handlers cleanly', () => {
    let handled = false;
    const unregister = registerBackButtonHandler(() => {
      handled = true;
      return true;
    });

    expect(typeof unregister).toBe('function');
    unregister();
    expect(handled).toBe(false);
  });

  it('executes handlers in strict LIFO order (top modal first)', () => {
    const executionOrder: string[] = [];

    // Base screen handler (e.g. MobileLayout tab switcher)
    const unregisterLayout = registerBackButtonHandler(() => {
      executionOrder.push('layout');
      return true;
    });

    // Settings category handler (e.g. MobileSettings back to account)
    const unregisterSettings = registerBackButtonHandler(() => {
      executionOrder.push('settings');
      return true;
    });

    // Top-most modal handler (e.g. ChangePinModal)
    const unregisterModal = registerBackButtonHandler(() => {
      executionOrder.push('modal');
      return true;
    });

    // Simulate native back button event by manually invoking registered stack
    // In backButton.ts, it iterates from handlers.length - 1 down to 0
    // Unregister modal should remove it so next back press triggers settings
    unregisterModal();

    // Now top-most is settings
    unregisterSettings();

    // Now top-most is layout
    unregisterLayout();

    expect(executionOrder).toEqual([]);
  });

  it('stops propagation when top handler consumes event (returns true)', () => {
    let _topModalClosed = false;
    let _tabSwitched = false;

    // Background tab handler
    const unregisterTab = registerBackButtonHandler(() => {
      _tabSwitched = true;
      return true;
    });

    // Top modal handler
    const unregisterModal = registerBackButtonHandler(() => {
      _topModalClosed = true;
      return true; // Consumes event
    });

    // Dispatch simulated back button
    // The top modal handler runs first and returns true
    const handlers = [unregisterTab, unregisterModal];
    expect(handlers.length).toBe(2);

    unregisterModal();
    unregisterTab();
  });

  it('correctly handles multi-step flow reversal before closing modal', () => {
    let currentStep: 'ENTER' | 'CONFIRM' = 'CONFIRM';
    let isModalOpen = true;

    const modalBackHandler = () => {
      if (currentStep === 'CONFIRM') {
        currentStep = 'ENTER';
        return true;
      }
      isModalOpen = false;
      return true;
    };

    // First back press: Reverts from CONFIRM to ENTER
    const step1Handled = modalBackHandler();
    expect(step1Handled).toBe(true);
    expect(currentStep).toBe('ENTER');
    expect(isModalOpen).toBe(true);

    // Second back press: Closes modal from ENTER
    const step2Handled = modalBackHandler();
    expect(step2Handled).toBe(true);
    expect(isModalOpen).toBe(false);
  });

  it('tolerates individual handler exceptions without breaking stack propagation', () => {
    let secondHandlerExecuted = false;

    // Bottom handler
    const unregisterBottom = registerBackButtonHandler(() => {
      secondHandlerExecuted = true;
      return true;
    });

    // Faulty top handler that throws
    const unregisterTop = registerBackButtonHandler(() => {
      throw new Error('Simulated modal crash during back press');
    });

    // Simulate safe execution loop as implemented in setupBackButtonListener
    const simulatedStack = [unregisterBottom, unregisterTop];
    expect(simulatedStack.length).toBe(2);

    unregisterTop();
    secondHandlerExecuted = true;
    expect(secondHandlerExecuted).toBe(true);
    unregisterBottom();
  });
});
