/**
 * @fileoverview Provides base64-encoded icon resources for the Mythic Mixology
 * Lab progressive web application. The module exposes helper utilities to
 * apply the assets to manifest and link elements while maintaining verbose
 * diagnostic logging for international engineering teams.
 */
(function (global) {
  'use strict';

  /**
   * Collection of data URI icon assets indexed by their square dimension.
   * @type {!Object<string, string>}
   */
  var ICON_DATA = {
    '192': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAABYklEQVR42u3SQQ0AAAgDsVlGM0ZmgfBuUgWXS2bhTwIMhIEwEAYCA2EgDISBwEAYCANhIDAQBsJAGAgMhIEwEAbCQGAgDISBMBAYCANhIAwEBsJAGAgDgYEwEAbCQBgIDISBMBAGAgNhIAyEgcBAGAgDYSAwEAbCQBgIA4GBMBAGwkAYCAyEgTAQBgIDYSAMhIHAQBgIA2EgMBAGwkAYCAOBgTAQBsJAYCAMhIEwEBgIA2EgDAQGwkAYCAOBgTAQBsJAGAgMhIEwEAYCA2EgDISBwEAYCANhIDAQBsJAGAgDgYEwEAbCQGAgDISBMBAYCANhIAwEBsJAGAgDYSAVMBAGwkAYCAyEgTAQBgIDYSAMhIHAQBgIA2EgMBAGwkAYCAOBgTAQBsJAYCAMhIEwEBgIA2EgDAQGwkAYCANhIDAQBsJAGAiuCj09SzKtn9oLAAAAAElFTkSuQmCC',
    '512': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAFn0lEQVR42u3VMQ0AAAgEsReFGRRjCw+sNKmCWy41DcBDkQDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADADAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADADAAFQAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAAAwAAAMAwAAAMAAADAAAAwDAAAAMQAUAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADADAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADADAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAgJsFtC1PsQGhgMYAAAAASUVORK5CYII='
  };

  /**
   * Generates an array of manifest-compatible icon descriptors.
   * @return {!Array<!Object<string, string>>} Array of manifest icon entries.
   */
  function buildManifestIcons() {
    return Object.keys(ICON_DATA).map(function (sizeKey) {
      return {
        src: ICON_DATA[sizeKey],
        sizes: sizeKey + 'x' + sizeKey,
        type: 'image/png',
      };
    });
  }

  /**
   * Retrieves the data URI for the requested square icon dimension.
   * @param {number} size Square dimension in pixels.
   * @return {string} Data URI string when available; otherwise an empty string.
   */
  function getIconDataUri(size) {
    var key = String(size);
    if (!Object.prototype.hasOwnProperty.call(ICON_DATA, key)) {
      console.warn('[IconAssets] Requested icon dimension not available.', { size: size });
      return '';
    }

    console.info('[IconAssets] Resolved icon data URI.', { size: size });
    return ICON_DATA[key];
  }

  /**
   * Applies the icon data URI to a provided link element, logging diagnostics.
   * @param {?HTMLLinkElement} linkElement Link element to receive the icon data.
   * @param {number} size Icon dimension to apply.
   */
  function applyIconToLink(linkElement, size) {
    if (!linkElement) {
      console.warn('[IconAssets] Link element unavailable for icon application.', { size: size });
      return;
    }

    var dataUri = getIconDataUri(size);
    if (!dataUri) {
      return;
    }

    linkElement.setAttribute('href', dataUri);
    console.info('[IconAssets] Icon data URI assigned to link element.', { size: size });
  }

  /**
   * Ensures the manifest link references a Blob URL containing the latest icons.
   * @param {?HTMLLinkElement} manifestLink Manifest link element to update.
   * @param {!Object<string, *>} manifestDefinition Base manifest definition.
   */
  function ensureManifest(manifestLink, manifestDefinition) {
    if (!manifestLink) {
      console.warn('[IconAssets] Manifest link element not found.');
      return '';
    }

    var manifest = Object.assign({}, manifestDefinition, { icons: buildManifestIcons() });
    var manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    var manifestUrl = URL.createObjectURL(manifestBlob);
    if (manifestLink.dataset.generatedManifestUrl) {
      URL.revokeObjectURL(manifestLink.dataset.generatedManifestUrl);
    }
    manifestLink.setAttribute('href', manifestUrl);
    manifestLink.dataset.generatedManifestUrl = manifestUrl;
    console.info('[IconAssets] Manifest link updated with generated icon payload.');
    return manifestUrl;
  }

  global.AppIconAssets = {
    buildManifestIcons: buildManifestIcons,
    getIconDataUri: getIconDataUri,
    applyIconToLink: applyIconToLink,
    ensureManifest: ensureManifest,
  };
})(typeof window !== 'undefined' ? window : this);
