const deleteProduct = (btn) => {
const productDomElement = btn.closest('article');
    const productId = btn.parentNode.querySelector('[name=productId]').value;
    const _csrf = btn.parentNode.querySelector('[name=_csrf]').value;
    fetch('/admin/delete-product/' + productId, {
        method: 'DELETE', headers: { 'csrf-token': _csrf }
    }).then(result=>{
        return result.json();
    })
    .then(info=>{
        console.log(info);
        productDomElement.parentNode.removeChild(productDomElement);
    })
    .catch(err=>{
        console.log(err)
    })
}