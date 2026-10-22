export class TitleInitials {
  static of(title: string): string {
    const words = title.trim().split(/\s+/).filter(Boolean);
    const relevantWords = words.filter((word) => word.length > 2);
    const sourceWords = relevantWords.length > 0 ? relevantWords : words;

    const initials = sourceWords
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");

    return initials || "?";
  }
}
