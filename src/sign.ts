// The public build shares contracts as PDFs. Remote signing needs your own signing service.
export const canSendLink = false;
export const signPage = (t: string) => t;
export const createLink = async (_code: string, _title: string, _client: string, _pdf: string): Promise<string> => '';
export type SignStatus = { token: string; status: string; signer_name: string; signature_png: string; signed_at: string; ip: string; user_agent: string; pdf_sha256: string };
export const linkStatus = async (_tokens: string[]): Promise<SignStatus[]> => [];
export const cancelLink = async (_t: string) => {};
