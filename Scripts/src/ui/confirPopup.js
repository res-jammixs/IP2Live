/**
 * confirPopup - Reference / Documentation Copy
 *
 * Runtime implementation:
 * Plugins/IP2Live_Core/modules/screens/confir-popup.js
 *
 * Public API:
 *
 * IP2Live.confirPopup.show({
 *     title: 'CONFIRM?',
 *     message: 'Continue with this action?',
 *     detail: 'OPTIONAL DETAIL',
 *     value: 'OPTIONAL VALUE',
 *     valueLabel: 'SELECTION',
 *     confirmLabel: 'CONFIRM',
 *     cancelLabel: 'CANCEL',
 *     danger: false,
 *     defaultConfirm: false,
 *     onConfirm: function () {},
 *     onCancel: function () {},
 * });
 *
 * The popup is a modal Scene.Base layer. It redraws the invoking scene below
 * an animated veil, freezes parent input, defaults to the safe Cancel action,
 * and supports keyboard and mouse navigation.
 */
