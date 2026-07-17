exports.main = async (context = {}) => ({
  ok: true,
  message: "__SPOTKIT_DISPLAY_NAME_JSON__ private function completed.",
  hasParameters: Boolean(context.parameters)
});
