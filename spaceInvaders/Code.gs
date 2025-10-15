function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Space Invaders');
}
