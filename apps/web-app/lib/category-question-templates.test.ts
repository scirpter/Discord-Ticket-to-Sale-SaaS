import { describe, expect, it } from 'vitest';

import { buildCategoryQuestionTemplateByKey } from './category-question-templates';

describe('buildCategoryQuestionTemplateByKey', () => {
  it('prefers the category product with the most non-email questions', () => {
    const templates = buildCategoryQuestionTemplateByKey([
      {
        id: 'product-1',
        category: 'Accounts',
        questions: [{ key: 'email' }],
      },
      {
        id: 'product-2',
        category: 'Accounts',
        questions: [{ key: 'email' }, { key: 'username' }, { key: 'password' }],
      },
    ]);

    expect(templates.get('accounts')).toEqual({
      category: 'Accounts',
      productId: 'product-2',
      questions: [{ key: 'email' }, { key: 'username' }, { key: 'password' }],
    });
  });

  it('keeps the first product when the category templates are equally complete', () => {
    const templates = buildCategoryQuestionTemplateByKey([
      {
        id: 'product-1',
        category: 'Accounts',
        questions: [{ key: 'email' }, { key: 'username' }],
      },
      {
        id: 'product-2',
        category: ' Accounts ',
        questions: [{ key: 'email' }, { key: 'login' }],
      },
    ]);

    expect(templates.get('accounts')?.productId).toBe('product-1');
  });

  it('ignores blank category names', () => {
    const templates = buildCategoryQuestionTemplateByKey([
      {
        id: 'product-1',
        category: '   ',
        questions: [{ key: 'email' }],
      },
    ]);

    expect(templates.size).toBe(0);
  });
});
