import * as React from 'react';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SectionMenu } from './dashboard-primitives';

globalThis.React = React;

function getElement<Props extends Record<string, unknown> = Record<string, unknown>>(
  node: ReactNode,
): ReactElement<Props> {
  if (!isValidElement(node)) {
    throw new Error('Expected a React element.');
  }

  return node as ReactElement<Props>;
}

describe('SectionMenu', () => {
  it('renders each row as a full-width button so the whole card is clickable', () => {
    const onChange = vi.fn();
    const view = SectionMenu({
      title: 'Coupons Menu',
      items: [
        {
          id: 'settings',
          label: 'Coupon Settings',
          description: 'Enable or disable coupons for this Discord server.',
          info: 'Helpful info',
        },
      ],
      activeId: 'settings',
      onChange,
    });

    const aside = getElement<{ children: ReactNode }>(view);
    const [, grid] = Children.toArray(aside.props.children);
    const gridElement = getElement<{ children: ReactNode }>(grid);
    const [row] = Children.toArray(gridElement.props.children);
    const rowElement = getElement<{ children: ReactNode }>(row);
    const [button] = Children.toArray(rowElement.props.children);
    const buttonElement = getElement<{ className: string; onClick: () => void }>(button);

    expect(buttonElement.type).toBe('button');
    expect(buttonElement.props.className).toContain('w-full');

    buttonElement.props.onClick();

    expect(onChange).toHaveBeenCalledWith('settings');
  });
});
