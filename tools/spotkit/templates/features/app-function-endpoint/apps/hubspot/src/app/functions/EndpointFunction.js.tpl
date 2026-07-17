exports.main = async (context = {}) => ({
  statusCode: 200,
  body: {
    ok: true,
    message: "__SPOTKIT_DISPLAY_NAME_JSON__ endpoint function is running.",
    requestId: context?.limits?.executionsRemaining ?? null
  }
});
