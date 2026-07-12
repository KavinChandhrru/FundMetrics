const MF_API_BASE = 'https://api.mfapi.in/mf';

export interface FundDetails {
  meta: {
    fund_house: string;
    scheme_type: string;
    scheme_category: string;
    scheme_code: number;
    scheme_name: string;
  };
  data: {
    date: string;
    nav: string;
  }[];
}

export async function fetchFundDetails(schemeCode: string | number): Promise<FundDetails> {
  const res = await fetch(`${MF_API_BASE}/${schemeCode}`);
  if (!res.ok) throw new Error('Failed to fetch fund details');
  return res.json();
}

export async function searchFunds(query: string): Promise<any[]> {
  if (!query) return [];
  const res = await fetch(`${MF_API_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search funds');
  return res.json();
}
