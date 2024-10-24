import { useTranslation } from 'react-i18next';

export const useTableKeyboardShortcuts = () => {
  const { t } = useTranslation();

  return [
    {
      key: "Arrow",
      description: t('kbd.shortcuts.table.arrowDescription'),
    },
    {
      key: "Shift + Arrow",
      description: t('kbd.shortcuts.table.shiftArrowDescription'),
    },
    {
      key: "Alt + Arrow",
      description: t('kbd.shortcuts.table.altArrowDescription'),
    },
    {
      key: "Ctrl/Cmd + Arrow | Home/End",
      description: t('kbd.shortcuts.table.ctrlArrowDescription'),
    },
    {
      key: "Ctrl/Cmd + Shift + Arrow",
      description: t('kbd.shortcuts.table.ctrlShiftArrowDescription'),
    },
    {
      key: "Shift + Home/End",
      description: t('kbd.shortcuts.table.shiftHomeEndDescription'),
    },
    {
      key: "Ctrl/Cmd + A",
      description: t('kbd.shortcuts.table.ctrlADescription'),
    },
    {
      key: "Shift + Space",
      description: t('kbd.shortcuts.table.shiftSpaceDescription'),
    },
    {
      key: "Ctrl + Space",
      description: t('kbd.shortcuts.table.ctrlSpaceDescription'),
    },
    {
      key: "PageUp/PageDown",
      description: t('kbd.shortcuts.table.pageUpDownDescription'),
    },
    {
      key: "Escape",
      description: t('kbd.shortcuts.table.escapeDescription'),
    },
    {
      key: "Ctrl/Cmd + D",
      description: t('kbd.shortcuts.table.ctrlDDescription'),
      flag: "downFill",
    },
    {
      key: "Ctrl/Cmd + R",
      description: t('kbd.shortcuts.table.ctrlRDescription'),
      flag: "rightFill",
    },
    {
      key: "Ctrl/Cmd + C",
      description: t('kbd.shortcuts.table.ctrlCDescription'),
    },
    {
      key: "Ctrl/Cmd + V",
      description: t('kbd.shortcuts.table.ctrlVDescription'),
    },
    {
      key: "Ctrl/Cmd + F",
      description: t('kbd.shortcuts.table.ctrlFDescription'),
      flag: "search",
      disabled: true,
    },
    {
      key: "Ctrl/Cmd + Home/End",
      description: t('kbd.shortcuts.table.ctrlHomeEndDescription'),
      flag: "first/last",
    },
    {
      key: "Ctrl/Cmd + Shift + Home/End",
      description: t('kbd.shortcuts.table.ctrlShiftHomeEndDescription'),
      flag: "first/last",
    },
  ];
};

export const useDocumentKeyboardShortcuts = () => {
  const { t } = useTranslation();

  return [
    {
      key: "Ctrl/Cmd + B",
      description: t('kbd.shortcuts.document.ctrlBDescription'),
    },
    {
      key: "Ctrl/Cmd + I",
      description: t('kbd.shortcuts.document.ctrlIDescription'),
    },
    {
      key: "Ctrl/Cmd + U",
      description: t('kbd.shortcuts.document.ctrlUDescription'),
    },
    {
      key: "Ctrl/Cmd + S",
      description: t('kbd.shortcuts.document.ctrlSDescription'),
    },
    {
      key: "#",
      description: t('kbd.shortcuts.document.heading1Description'),
    },
    {
      key: "##",
      description: t('kbd.shortcuts.document.heading2Description'),
    },
    {
      key: "###",
      description: t('kbd.shortcuts.document.heading3Description'),
    },
    {
      key: "[]",
      description: t('kbd.shortcuts.document.checkboxDescription'),
    },
    {
      key: "-",
      description: t('kbd.shortcuts.document.unorderedListDescription'),
    },
    {
      key: "number + .",
      description: t('kbd.shortcuts.document.orderedListDescription'),
    },
    {
      key: "```",
      description: t('kbd.shortcuts.document.codeBlockDescription'),
    },
    {
      key: "---",
      description: t('kbd.shortcuts.document.horizontalRuleDescription'),
    },
  ];
};

export const useCommonKeyboardShortcuts = () => {
  const { t } = useTranslation();

  return [
    {
      key: "Ctrl/Cmd + /",
      description: t('kbd.shortcuts.common.toggleChatbotDescription'),
    },
    {
      key: "Ctrl/Cmd + \\",
      description: t('kbd.shortcuts.common.toggleSidebarDescription'),
    },
    {
      key: "Ctrl/Cmd + Shift + L",
      description: t('kbd.shortcuts.common.toggleThemeDescription'),
    },
    {
      key: "Ctrl/Cmd + K",
      description: t('kbd.shortcuts.common.toggleCommandPaletteDescription'),
    },
    {
      key: "Ctrl/Cmd + ,",
      description: t('kbd.shortcuts.common.openSettingsDescription'),
    },
  ];
};
