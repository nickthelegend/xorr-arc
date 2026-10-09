/** App-wide UI state that is not on chain: whether balances are masked, and the signed-in wallet. */
import { create } from 'zustand';

type UiState = {
  balancesHidden: boolean;
  setBalancesHidden: (v: boolean) => void;
};

export const useStore = create<UiState>((set) => ({
  balancesHidden: false,
  setBalancesHidden: (balancesHidden) => set({ balancesHidden }),
}));
