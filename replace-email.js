'use strict';

(function(){
  function caesar(s, k) {
    let t = '';
    for (let i = 0; i < s.length; ++i) {
      let cc = s.charCodeAt(i);
      if (cc >= 97 && cc <= 97 + 26) cc = (cc - 97 + 26 + k) % 26 + 97;
      t += String.fromCharCode(cc);
    }
    return t;
  }

  const address = caesar('ymwe@hqdhqd.ot', 14);

  document.querySelectorAll('a.replace-email').forEach((a) => {
    a.href = a.href.replace('my-email', escape(address));
    a.textContent = address;
  });
})();
