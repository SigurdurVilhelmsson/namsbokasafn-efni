/**
 * chapter-modules.js
 *
 * Module mappings for OpenStax Chemistry 2e.
 * Maps OpenStax module IDs to chapter/section/title metadata.
 *
 * Extracted from pipeline-runner.js so active pipeline tools
 * (cnxml-extract, cnxml-inject, cnxml-render) can use it
 * without depending on the deprecated pipeline runner.
 */

// Module mappings from OpenStax Chemistry 2e collection
// Verified against chemistry-2e.collection.xml from GitHub
const CHEMISTRY_2E_MODULES = {
  // Chapter 1: Essential Ideas
  m68663: { chapter: 1, section: 'intro', title: 'Introduction' },
  m68664: { chapter: 1, section: '1.1', title: 'Chemistry in Context' },
  m68667: { chapter: 1, section: '1.2', title: 'Phases and Classification of Matter' },
  m68670: { chapter: 1, section: '1.3', title: 'Physical and Chemical Properties' },
  m68674: { chapter: 1, section: '1.4', title: 'Measurements' },
  m68690: {
    chapter: 1,
    section: '1.5',
    title: 'Measurement Uncertainty, Accuracy, and Precision',
  },
  m68683: { chapter: 1, section: '1.6', title: 'Mathematical Treatment of Measurement Results' },
  // Chapter 2: Atoms, Molecules, and Ions
  m68684: { chapter: 2, section: 'intro', title: 'Introduction' },
  m68685: { chapter: 2, section: '2.1', title: 'Early Ideas in Atomic Theory' },
  m68687: { chapter: 2, section: '2.2', title: 'Evolution of Atomic Theory' },
  m68692: { chapter: 2, section: '2.3', title: 'Atomic Structure and Symbolism' },
  m68693: { chapter: 2, section: '2.4', title: 'Chemical Formulas' },
  m68695: { chapter: 2, section: '2.5', title: 'The Periodic Table' },
  m68696: { chapter: 2, section: '2.6', title: 'Ionic and Molecular Compounds' },
  m68698: { chapter: 2, section: '2.7', title: 'Chemical Nomenclature' },
  // Chapter 3: Composition of Substances and Solutions
  m68699: { chapter: 3, section: 'intro', title: 'Introduction' },
  m68700: { chapter: 3, section: '3.1', title: 'Formula Mass and the Mole Concept' },
  m68702: { chapter: 3, section: '3.2', title: 'Determining Empirical and Molecular Formulas' },
  m68703: { chapter: 3, section: '3.3', title: 'Molarity' },
  m68704: { chapter: 3, section: '3.4', title: 'Other Units for Solution Concentrations' },
  // Chapter 4: Stoichiometry of Chemical Reactions
  m68730: { chapter: 4, section: 'intro', title: 'Introduction' },
  m68709: { chapter: 4, section: '4.1', title: 'Writing and Balancing Chemical Equations' },
  m68710: { chapter: 4, section: '4.2', title: 'Classifying Chemical Reactions' },
  m68713: { chapter: 4, section: '4.3', title: 'Reaction Stoichiometry' },
  m68714: { chapter: 4, section: '4.4', title: 'Reaction Yields' },
  m68716: { chapter: 4, section: '4.5', title: 'Quantitative Chemical Analysis' },
  // Chapter 5: Thermochemistry
  m68723: { chapter: 5, section: 'intro', title: 'Introduction' },
  m68724: { chapter: 5, section: '5.1', title: 'Energy Basics' },
  m68726: { chapter: 5, section: '5.2', title: 'Calorimetry' },
  m68727: { chapter: 5, section: '5.3', title: 'Enthalpy' },
  // Chapter 9: Gases
  m68748: { chapter: 9, section: 'intro', title: 'Introduction' },
  m68750: { chapter: 9, section: '9.1', title: 'Gas Pressure' },
  m68751: {
    chapter: 9,
    section: '9.2',
    title: 'Relating Pressure, Volume, Amount, and Temperature: The Ideal Gas Law',
  },
  m68752: {
    chapter: 9,
    section: '9.3',
    title: 'Stoichiometry of Gaseous Substances, Mixtures, and Reactions',
  },
  m68754: { chapter: 9, section: '9.4', title: 'Effusion and Diffusion of Gases' },
  m68758: { chapter: 9, section: '9.5', title: 'The Kinetic-Molecular Theory' },
  m68759: { chapter: 9, section: '9.6', title: 'Non-Ideal Gas Behavior' },
  // Chapter 12: Kinetics
  m68785: { chapter: 12, section: 'intro', title: 'Introduction' },
  m68786: { chapter: 12, section: '12.1', title: 'Chemical Reaction Rates' },
  m68787: { chapter: 12, section: '12.2', title: 'Factors Affecting Reaction Rates' },
  m68789: { chapter: 12, section: '12.3', title: 'Rate Laws' },
  m68791: { chapter: 12, section: '12.4', title: 'Integrated Rate Laws' },
  m68793: { chapter: 12, section: '12.5', title: 'Collision Theory' },
  m68794: { chapter: 12, section: '12.6', title: 'Reaction Mechanisms' },
  m68795: { chapter: 12, section: '12.7', title: 'Catalysis' },
  // Chapter 13: Fundamental Equilibrium Concepts
  m68796: { chapter: 13, section: 'intro', title: 'Introduction' },
  m68797: { chapter: 13, section: '13.1', title: 'Chemical Equilibria' },
  m68798: { chapter: 13, section: '13.2', title: 'Equilibrium Constants' },
  m68799: { chapter: 13, section: '13.3', title: "Shifting Equilibria: Le Châtelier's Principle" },
  m68801: { chapter: 13, section: '13.4', title: 'Equilibrium Calculations' },
};

/**
 * Get all modules for a specific chapter in order
 * @param {number} chapter - Chapter number
 * @returns {Array<{moduleId: string, chapter: number, section: string, title: string}>}
 */
function getChapterModules(chapter) {
  const modules = [];
  for (const [moduleId, info] of Object.entries(CHEMISTRY_2E_MODULES)) {
    if (info.chapter === chapter) {
      modules.push({ moduleId, ...info });
    }
  }
  // Sort by section: intro first, then numerically
  modules.sort((a, b) => {
    if (a.section === 'intro') return -1;
    if (b.section === 'intro') return 1;
    const aNum = parseFloat(a.section.split('.')[1]) || 0;
    const bNum = parseFloat(b.section.split('.')[1]) || 0;
    return aNum - bNum;
  });
  return modules;
}

export { CHEMISTRY_2E_MODULES, getChapterModules };
