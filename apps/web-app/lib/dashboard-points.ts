export type PointsPanelId =
  | 'reward-settings'
  | 'earning-categories'
  | 'redemption-categories'
  | 'customer-points';

export function shouldLoadCustomerPoints(input: {
  pointsEnabled: boolean;
  activePanel: PointsPanelId;
}): boolean {
  return input.pointsEnabled && input.activePanel === 'customer-points';
}

export function shouldShowCustomerPointsLoading(input: {
  loadingCustomers: boolean;
  customerCount: number;
}): boolean {
  return input.loadingCustomers && input.customerCount === 0;
}
