export async function jsonOrThrow(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Барањето не успеа.");
  return body;
}
