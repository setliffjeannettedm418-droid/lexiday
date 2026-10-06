declare module "wink-lemmatizer" {
  const lemmatize: { noun(word: string): string; verb(word: string): string; adjective(word: string): string };
  export default lemmatize;
}
declare module "wink-lexicon/src/wn-*-exceptions.js" {
  const exceptions: Record<string, string>;
  export default exceptions;
}
