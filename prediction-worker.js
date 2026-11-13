/* Health records never leave this worker's browser origin. */
importScripts('./research-model.js', './model.js');
function serialiseForecast(forecast) {
  const { cdf, quantile, probability, ...data } = forecast;
  return data;
}
self.onmessage = function (event) {
  const { id, state, asOf } = event.data;
  try {
    const records = CycleModel.validate(state, asOf);
    const forecast = CycleModel.forecast(records.periods, records.context, asOf);
    self.postMessage({ id, type: 'forecast', forecast: serialiseForecast(forecast) });
    // Evaluation is separate so it does not delay the current forecast.
    const backtest = CycleModel.backtest(records.periods);
    self.postMessage({ id, type: 'backtest', backtest });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error.message });
  }
};
