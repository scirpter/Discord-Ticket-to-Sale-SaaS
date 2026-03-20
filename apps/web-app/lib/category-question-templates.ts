const REQUIRED_EMAIL_QUESTION_KEY = 'email';

type CategoryTemplateQuestion = {
  key: string;
};

type CategoryTemplateProduct<TQuestion extends CategoryTemplateQuestion> = {
  id: string;
  category: string;
  questions: TQuestion[];
};

export type CategoryQuestionTemplate<TQuestion extends CategoryTemplateQuestion> = {
  category: string;
  productId: string;
  questions: TQuestion[];
};

function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase();
}

function countCustomQuestions<TQuestion extends CategoryTemplateQuestion>(
  questions: readonly TQuestion[],
): number {
  return questions.reduce((count, question) => {
    return question.key.trim().toLowerCase() === REQUIRED_EMAIL_QUESTION_KEY ? count : count + 1;
  }, 0);
}

export function buildCategoryQuestionTemplateByKey<TQuestion extends CategoryTemplateQuestion>(
  products: readonly CategoryTemplateProduct<TQuestion>[],
): Map<string, CategoryQuestionTemplate<TQuestion>> {
  const templates = new Map<string, CategoryQuestionTemplate<TQuestion>>();

  for (const product of products) {
    const key = normalizeCategoryKey(product.category);
    if (!key) {
      continue;
    }

    const nextTemplate: CategoryQuestionTemplate<TQuestion> = {
      category: product.category.trim(),
      productId: product.id,
      questions: product.questions,
    };
    const existingTemplate = templates.get(key);

    if (!existingTemplate) {
      templates.set(key, nextTemplate);
      continue;
    }

    if (countCustomQuestions(nextTemplate.questions) > countCustomQuestions(existingTemplate.questions)) {
      templates.set(key, nextTemplate);
    }
  }

  return templates;
}
