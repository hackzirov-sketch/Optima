"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedBannedContent1781700000000 = void 0;
class SeedBannedContent1781700000000 {
    async up(queryRunner) {
        const existing = await queryRunner.query(`SELECT COUNT(*) FROM banned_content WHERE category IN ('adult','contraband','violence','fraud')`);
        if (parseInt(existing[0].count, 10) > 0)
            return;
        const rows = [
            { pattern: 'porn', category: 'adult', isRegex: false },
            { pattern: 'xxx', category: 'adult', isRegex: false },
            { pattern: 'nude', category: 'adult', isRegex: false },
            { pattern: 'naked', category: 'adult', isRegex: false },
            { pattern: 'nsfw', category: 'adult', isRegex: false },
            { pattern: 'onlyfans', category: 'adult', isRegex: false },
            { pattern: 'escort', category: 'adult', isRegex: false },
            { pattern: 'cocaine', category: 'contraband', isRegex: false },
            { pattern: 'heroin', category: 'contraband', isRegex: false },
            { pattern: 'fentanyl', category: 'contraband', isRegex: false },
            { pattern: 'drug deal', category: 'contraband', isRegex: false },
            { pattern: 'buy weed', category: 'contraband', isRegex: false },
            { pattern: 'illegal gun', category: 'contraband', isRegex: false },
            { pattern: 'stolen card', category: 'contraband', isRegex: false },
            { pattern: 'counterfeit', category: 'contraband', isRegex: false },
            { pattern: 'kill yourself', category: 'violence', isRegex: false },
            { pattern: 'bomb threat', category: 'violence', isRegex: false },
            { pattern: 'terrorist', category: 'violence', isRegex: false },
            { pattern: 'phishing', category: 'fraud', isRegex: false },
            { pattern: 'money laundering', category: 'fraud', isRegex: false },
            { pattern: 'pyramid scheme', category: 'fraud', isRegex: false },
            { pattern: '(?:buy|sell)\\s+(?:drugs?|meth|crack)', category: 'contraband', isRegex: true },
            { pattern: '\\b(?:cp|child\\s*porn)', category: 'adult', isRegex: true },
        ];
        for (const row of rows) {
            await queryRunner.query(`INSERT INTO banned_content (pattern, category, is_regex, active) VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING`, [row.pattern, row.category, row.isRegex]);
        }
    }
    async down(queryRunner) {
        await queryRunner.query(`DELETE FROM banned_content WHERE category IN ('adult','contraband','violence','fraud')`);
    }
}
exports.SeedBannedContent1781700000000 = SeedBannedContent1781700000000;
//# sourceMappingURL=1781700000000-SeedBannedContent.js.map